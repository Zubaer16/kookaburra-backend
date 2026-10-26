import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { S3MediaProvider, inspectImage } from './s3.storage'
import { CloudinaryMediaProvider } from './storage'
import { MediaStorageRegistry } from './storage.registry'

const config = (
  provider: 'cloudinary' | 's3' = 's3',
  overrides: Record<string, string> = {},
) => {
  const values: Record<string, string> = {
    MEDIA_PROVIDER: provider,
    MEDIA_S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
    MEDIA_S3_BUCKET: 'sample-public-bucket',
    MEDIA_S3_REGION: 'us-east-1',
    MEDIA_S3_ACCESS_KEY_ID: 'EXAMPLEKEY1234',
    MEDIA_S3_SECRET_ACCESS_KEY: 'example-local-secret-not-for-use',
    MEDIA_S3_PUBLIC_BASE_URL: 'https://cdn.example.test/product-images',
  }
  return {
    get: (key: string) =>
      (({ ...values, ...overrides }) as Record<string, string>)[key],
  } as ConfigService<Environment, true>
}
const createPNG = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAPAAAAC0CAYAAACqnKHoAAAAvklEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GOj0gABFJKdrgAAAABJRU5ErkJggg==',
    'base64',
  )

describe('03C-2A AWS S3 / R2 signature and provider routing', () => {
  it('presigns upload with MIME bound, expiry and no secret', () => {
    const provider = new S3MediaProvider(config())
    const result = provider.signedUpload('projects/sample/123', 'image/png')
    const url = new URL(result.uploadUrl)
    expect(url.origin).toBe('https://s3.us-east-1.amazonaws.com')
    expect(url.pathname).toBe('/sample-public-bucket/projects/sample/123')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-type;host;if-none-match',
    )
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Content-Sha256')).toBe(
      'UNSIGNED-PAYLOAD',
    )
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(result.method).toBe('PUT')
    expect(result.headers).toEqual({
      'Content-Type': 'image/png',
      'If-None-Match': '*',
    })
    expect(result.fields).toEqual({})
    expect(JSON.stringify(result)).not.toContain('example-local-secret')
    expect(() =>
      provider.signedUpload('projects/sample/123', 'image/avif'),
    ).toThrow()
  })
  it('supports Cloudflare R2 region auto and path-style bucket routing', () => {
    const provider = new S3MediaProvider(
      config('s3', {
        MEDIA_S3_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
        MEDIA_S3_REGION: 'auto',
      }),
    )
    const signed = new URL(
      provider.signedUpload('projects/sample/asset', 'image/webp').uploadUrl,
    )
    expect(signed.origin).toBe('https://accountid.r2.cloudflarestorage.com')
    expect(signed.pathname).toBe('/sample-public-bucket/projects/sample/asset')
    expect(signed.searchParams.get('X-Amz-Credential')).toContain(
      '/auto/s3/aws4_request',
    )
  })
  it('routes verification and cleanup to recorded provider, even after default switching', () => {
    const cfg = config('s3')
    const cloud = new CloudinaryMediaProvider(cfg)
    const s3 = new S3MediaProvider(cfg)
    const registry = new MediaStorageRegistry(cfg, cloud, s3)
    expect(registry.current).toBe(s3)
    expect(registry.forKey('cloudinary')).toBe(cloud)
    expect(registry.forKey('s3')).toBe(s3)
    expect(() => registry.forKey('unknown')).toThrow()
  })
  it('derives dimensions from image bytes; rejects spoofed/invalid bytes', () => {
    expect(inspectImage(createPNG())).toEqual({
      mimeType: 'image/png',
      width: 240,
      height: 180,
    })
    expect(() => inspectImage(Buffer.from('<svg />'))).toThrow()
    const altered = createPNG()
    altered.writeUInt32BE(15000, 16)
    expect(() => inspectImage(altered)).toThrow()
  })
  it('HEAD + GET verifies actual MIME, size, dimensions and public URL', async () => {
    const provider = new S3MediaProvider(config())
    const original = global.fetch
    const png = createPNG()
    const requests: Array<{ method: string; url: string }> = []
    global.fetch = jest
      .fn()
      .mockImplementation((url: string, init: RequestInit) => {
        requests.push({ method: init.method!, url })
        return Promise.resolve(
          init.method === 'HEAD'
            ? new Response(null, {
                status: 200,
                headers: {
                  'content-length': `${png.length}`,
                  'content-type': 'image/png',
                },
              })
            : new Response(Uint8Array.from(png).buffer as ArrayBuffer, {
                status: 200,
              }),
        )
      }) as typeof fetch
    try {
      expect(await provider.verify('projects/sample/123')).toMatchObject({
        mimeType: 'image/png',
        width: 240,
        height: 180,
        bytes: png.length,
        url: 'https://cdn.example.test/product-images/projects/sample/123',
      })
      expect(requests.map((x) => x.method)).toEqual(['HEAD', 'GET'])
      expect(
        requests.every((x) =>
          new URL(x.url).searchParams.has('X-Amz-Signature'),
        ),
      ).toBe(true)
    } finally {
      global.fetch = original
    }
  })
  it('rejects provider response spoofing and treats missing deletion as idempotent', async () => {
    const provider = new S3MediaProvider(config())
    const original = global.fetch
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'content-length': '1024', 'content-type': 'image/svg+xml' },
      }),
    ) as typeof fetch
    try {
      await expect(provider.verify('projects/sample/123')).rejects.toThrow()
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 })) as typeof fetch
      await expect(
        provider.delete('projects/sample/123'),
      ).resolves.toBeUndefined()
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response(null, { status: 403 })) as typeof fetch
      await expect(provider.delete('projects/sample/123')).rejects.toThrow()
    } finally {
      global.fetch = original
    }
  })
})
