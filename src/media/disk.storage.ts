import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  link,
  unlink,
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import type {
  MediaStorageProvider,
  UploadInstruction,
  VerifiedMedia,
} from './storage'
import { inspectImage } from './s3.storage'

const MAX_BYTES = 10 * 1024 * 1024
const TOKEN_TTL = 15 * 60
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp'])
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')

/** Node fs errors can originate outside Jest's VM realm; instanceof Error is unreliable. */
const hasFsCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code

/** A VPS-only provider. Never mount this directory on an ephemeral Vercel function. */
@Injectable()
export class DiskMediaProvider implements MediaStorageProvider {
  readonly key = 'disk'
  constructor(private readonly config: ConfigService<Environment, true>) {}

  private settings() {
    const root = this.config.get('MEDIA_DISK_ROOT', { infer: true })
    const api = this.config.get('MEDIA_DISK_API_BASE_URL', { infer: true })
    const publicBase = this.config.get('MEDIA_DISK_PUBLIC_BASE_URL', {
      infer: true,
    })
    const secret = this.config.get('MEDIA_DISK_UPLOAD_SECRET', { infer: true })
    if (!root || !api || !publicBase || !secret)
      throw new ServiceUnavailableException(
        'Persistent disk media storage not configured',
      )
    return { root, api, publicBase, secret }
  }

  /** Restrict disk access to the configured namespace and generated UUIDs only. */
  private objectPath(objectKey: string) {
    const { root } = this.settings()
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    if (!objectKey.startsWith(`${namespace}/`))
      throw new ConflictException('Wrong media namespace')
    const mediaId = objectKey.slice(namespace.length + 1)
    if (!uuid.test(mediaId))
      throw new ConflictException('Invalid storage asset key')
    const full = resolve(root, ...namespace.split('/'), mediaId)
    const rel = relative(resolve(root), full)
    if (
      !rel ||
      rel === '..' ||
      rel.startsWith(`..${sep}`) ||
      rel.startsWith(sep)
    )
      throw new ConflictException('Invalid media storage path')
    return { full, mediaId, root: resolve(root) }
  }

  private sign(mediaId: string, mime: string, expires: number, secret: string) {
    return createHmac('sha256', secret)
      .update(`disk-upload:v1:${mediaId}:${mime}:${expires}`)
      .digest('hex')
  }

  signedUpload(objectKey: string, mimeType?: string): UploadInstruction {
    if (!mimeType || !allowedMime.has(mimeType))
      throw new BadRequestException('Disk adapter accepts JPEG, PNG and WebP')
    const { api, secret } = this.settings()
    const { mediaId } = this.objectPath(objectKey)
    const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL
    return {
      method: 'PUT',
      uploadUrl: `${api}/v1/media/disk-uploads/${mediaId}`,
      fields: {},
      headers: {
        'Content-Type': mimeType,
        'X-Media-Upload-Token': `${expires}.${this.sign(mediaId, mimeType, expires, secret)}`,
      },
    }
  }

  /** Token is bound to the DB-owned media UUID, MIME and a short expiry. */
  private authorize(objectKey: string, mimeType: string, token: string) {
    const { secret } = this.settings()
    const { mediaId } = this.objectPath(objectKey)
    const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token)
    if (!match)
      throw new ForbiddenException('Invalid disk upload authorization')
    const expires = Number(match[1])
    if (
      expires < Math.floor(Date.now() / 1000) ||
      expires > Math.floor(Date.now() / 1000) + TOKEN_TTL
    )
      throw new ForbiddenException('Expired disk upload authorization')
    const expected = Buffer.from(
      this.sign(mediaId, mimeType, expires, secret),
      'hex',
    )
    const given = Buffer.from(match[2]!, 'hex')
    if (!timingSafeEqual(expected, given))
      throw new ForbiddenException('Invalid disk upload authorization')
  }

  /** Create directories under a trusted persistent root; reject symlinked directories. */
  private async safeDirectory(objectKey: string) {
    const { full, root } = this.objectPath(objectKey)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const segments = relative(root, dirname(full)).split(sep).filter(Boolean)
    let current = root
    if ((await lstat(current)).isSymbolicLink())
      throw new ConflictException('Disk media root must not be a symbolic link')
    for (const segment of segments) {
      current = join(current, segment)
      await mkdir(current, { recursive: true, mode: 0o700 })
      if ((await lstat(current)).isSymbolicLink())
        throw new ConflictException(
          'Disk media path must not contain symbolic links',
        )
    }
    const canonicalRoot = await realpath(root)
    const canonicalParent = await realpath(dirname(full))
    const rel = relative(canonicalRoot, canonicalParent)
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep))
      throw new ConflictException('Disk media path escaped storage root')
    return full
  }

  /** Called through the signed raw PUT endpoint, after DB checks; no memory-buffered request body. */
  async receive(
    objectKey: string,
    mimeType: string,
    approvedBytes: number,
    token: string,
    stream: Readable,
    contentLength: number,
  ): Promise<void> {
    this.authorize(objectKey, mimeType, token)
    if (
      !allowedMime.has(mimeType) ||
      !Number.isSafeInteger(contentLength) ||
      contentLength < 1 ||
      contentLength > MAX_BYTES ||
      contentLength > approvedBytes
    )
      throw new BadRequestException('Upload content type or length is invalid')
    const target = await this.safeDirectory(objectKey)
    const temp = `${target}.${randomUUID()}.upload`
    let created = false
    let descriptor: Awaited<ReturnType<typeof open>> | undefined
    try {
      descriptor = await open(temp, 'wx', 0o600)
      created = true
      let count = 0
      for await (const part of stream) {
        const chunk: Buffer = Buffer.isBuffer(part)
          ? part
          : Buffer.from(part as Uint8Array)
        count += chunk.length
        if (count > contentLength || count > approvedBytes || count > MAX_BYTES)
          throw new BadRequestException('Upload exceeded authorized size')
        await descriptor.writeFile(chunk)
      }
      if (count !== contentLength)
        throw new BadRequestException('Truncated media upload')
      await descriptor.sync()
      await descriptor.close()
      descriptor = undefined
      const bytes = await readFile(temp)
      const parsed = inspectImage(bytes)
      if (parsed.mimeType !== mimeType)
        throw new BadRequestException(
          'Image file type does not match upload authorization',
        )
      // Hard-link is atomic and fails if target exists. It cannot overwrite a verified asset.
      await link(temp, target)
    } catch (error) {
      if (hasFsCode(error, 'EEXIST'))
        throw new ConflictException('Media already uploaded')
      throw error
    } finally {
      if (descriptor) await descriptor.close().catch(() => undefined)
      if (created) await unlink(temp).catch(() => undefined)
    }
  }

  async verify(objectKey: string): Promise<VerifiedMedia> {
    const { publicBase } = this.settings()
    const { full, mediaId } = this.objectPath(objectKey)
    let bytes: Buffer
    try {
      const info = await lstat(full)
      if (
        !info.isFile() ||
        info.size < 1 ||
        info.size > MAX_BYTES ||
        info.nlink !== 1
      )
        throw new ConflictException('Invalid on-disk media')
      bytes = await readFile(full)
      if (bytes.length !== info.size)
        throw new ConflictException('Media file changed during verification')
    } catch (error) {
      if (hasFsCode(error, 'ENOENT'))
        throw new ConflictException('Upload not found on persistent disk')
      throw error
    }
    const details = inspectImage(bytes)
    return {
      assetId: hash(bytes),
      url: `${publicBase}/v1/media/files/${mediaId}`,
      bytes: bytes.length,
      ...details,
    }
  }

  async getStream(objectKey: string) {
    const { full } = this.objectPath(objectKey)
    try {
      const info = await lstat(full)
      if (
        !info.isFile() ||
        info.size < 1 ||
        info.size > MAX_BYTES ||
        info.nlink !== 1
      )
        throw new NotFoundException('Media not available')
    } catch (error) {
      if (hasFsCode(error, 'ENOENT'))
        throw new NotFoundException('Media not available')
      throw error
    }
    return createReadStream(full)
  }

  async delete(objectKey: string): Promise<void> {
    const { full } = this.objectPath(objectKey)
    try {
      await unlink(full)
    } catch (error) {
      if (hasFsCode(error, 'ENOENT')) return
      throw new BadGatewayException('Persistent disk media deletion failed')
    }
  }
}
