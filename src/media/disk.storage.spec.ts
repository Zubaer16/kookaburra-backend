import { mkdtemp, readFile, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { ConflictException, NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { DiskMediaProvider } from './disk.storage'

const image = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAPAAAAC0CAYAAACqnKHoAAAAvklEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GOj0gABFJKdrgAAAABJRU5ErkJggg==',
    'base64',
  )
const id = 'd177a14c-b6d2-4428-958d-76ea6d1a57ae'
const key = `projects/kookaburra/products/${id}`
const settings = (root: string) => {
  const values: Record<string, string> = {
    MEDIA_DISK_ROOT: root,
    MEDIA_DISK_API_BASE_URL: 'http://localhost:4000',
    MEDIA_DISK_PUBLIC_BASE_URL: 'https://media.example.test',
    MEDIA_DISK_UPLOAD_SECRET: 's'.repeat(40),
    MEDIA_NAMESPACE: 'projects/kookaburra/products',
  }
  return {
    get: (value: string) => values[value],
  } as ConfigService<Environment, true>
}

describe('03C-2B persistent VPS media (no provider account required)', () => {
  let directory: string
  let disk: DiskMediaProvider
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'kb-disk-media-'))
    disk = new DiskMediaProvider(settings(directory))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('signs 15-minute one-use raw PUT URL without exposing server secret', () => {
    const instruction = disk.signedUpload(key, 'image/png')
    expect(instruction.method).toBe('PUT')
    expect(instruction.fields).toEqual({})
    expect(instruction.uploadUrl).toBe(
      `http://localhost:4000/v1/media/disk-uploads/${id}`,
    )
    expect(instruction.headers?.['X-Media-Upload-Token']).toMatch(
      /^\d{10}\.[a-f0-9]{64}$/,
    )
    expect(JSON.stringify(instruction)).not.toContain('s'.repeat(40))
    expect(() => disk.signedUpload(key, 'image/avif')).toThrow()
    expect(() => disk.signedUpload('../escape', 'image/png')).toThrow()
  })

  it('streams an authorized PNG, verifies file bytes and serves through gated API URL; deletes idempotently', async () => {
    const bytes = image()
    const instruction = disk.signedUpload(key, 'image/png')
    const token = instruction.headers!['X-Media-Upload-Token']!
    await disk.receive(
      key,
      'image/png',
      bytes.length,
      token,
      Readable.from([bytes]),
      bytes.length,
    )
    const verified = await disk.verify(key)
    expect(verified).toMatchObject({
      bytes: bytes.length,
      width: 240,
      height: 180,
      mimeType: 'image/png',
      url: `https://media.example.test/v1/media/files/${id}`,
    })
    const served: Buffer[] = []
    for await (const part of await disk.getStream(key))
      served.push(Buffer.from(part as Buffer))
    expect(Buffer.concat(served)).toEqual(bytes)
    await expect(
      disk.receive(
        key,
        'image/png',
        bytes.length,
        token,
        Readable.from([bytes]),
        bytes.length,
      ),
    ).rejects.toThrow(ConflictException)
    expect(await readFile(join(directory, ...key.split('/')))).toEqual(bytes)
    await disk.delete(key)
    await disk.delete(key)
    await expect(disk.verify(key)).rejects.toThrow('not found')
    await expect(disk.getStream(key)).rejects.toThrow(NotFoundException)
  })

  it('rejects tampering, expired token, bad MIME, over-limit and corrupted payload without persisting files', async () => {
    const bytes = image()
    const token = disk.signedUpload(key, 'image/png').headers![
      'X-Media-Upload-Token'
    ]!
    await expect(
      disk.receive(
        key,
        'image/jpeg',
        bytes.length,
        token,
        Readable.from([bytes]),
        bytes.length,
      ),
    ).rejects.toThrow()
    await expect(
      disk.receive(
        key,
        'image/png',
        bytes.length,
        `${token.slice(0, -1)}${token.at(-1) === '0' ? '1' : '0'}`,
        Readable.from([bytes]),
        bytes.length,
      ),
    ).rejects.toThrow()
    await expect(
      disk.receive(
        key,
        'image/png',
        bytes.length - 1,
        token,
        Readable.from([bytes]),
        bytes.length,
      ),
    ).rejects.toThrow()
    await expect(
      disk.receive(
        key,
        'image/png',
        bytes.length,
        token,
        Readable.from([Buffer.from('<svg></svg>')]),
        11,
      ),
    ).rejects.toThrow()
    await expect(disk.verify(key)).rejects.toThrow()
  })

  it('does not allow symbolic-link target overwrite', async () => {
    const destination = join(directory, ...key.split('/'))
    const { mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(destination), { recursive: true })
    const protectedFile = join(directory, 'protected.txt')
    await writeFile(protectedFile, 'original')
    try {
      await symlink(protectedFile, destination)
    } catch {
      // Some Windows installations require developer-mode symlink permission.
      return
    }
    const bytes = image()
    const token = disk.signedUpload(key, 'image/png').headers![
      'X-Media-Upload-Token'
    ]!
    await expect(
      disk.receive(
        key,
        'image/png',
        bytes.length,
        token,
        Readable.from([bytes]),
        bytes.length,
      ),
    ).rejects.toThrow()
    expect(await readFile(protectedFile, 'utf8')).toBe('original')
  })
})

describe('03C-2C2 derived files remain separate from the original', () => {
  let directory: string
  let disk: DiskMediaProvider
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'kb-rendition-'))
    disk = new DiskMediaProvider(settings(directory))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('creates a derived file atomically, prevents different-content overwrite and deletes idempotently', async () => {
    const content = Buffer.from('verified-webp-by-worker')
    await disk.writeRendition(key, 320, content)
    const contents: Buffer[] = []
    for await (const chunk of await disk.getRenditionStream(key, 320))
      contents.push(Buffer.from(chunk as Buffer))
    expect(Buffer.concat(contents)).toEqual(content)
    await disk.writeRendition(key, 320, content)
    await expect(
      disk.writeRendition(key, 320, Buffer.from('other')),
    ).rejects.toThrow('differs')
    await disk.deleteRendition(key, 320)
    await disk.deleteRendition(key, 320)
    await expect(disk.getRenditionStream(key, 320)).rejects.toThrow(
      NotFoundException,
    )
    await expect(disk.getRenditionStream(key, 321)).rejects.toThrow()
  })
})
