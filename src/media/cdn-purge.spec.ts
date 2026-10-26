import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import { MediaCdnPurgeService } from './cdn-purge.service'

const cfg = (override: Record<string, string> = {}) =>
  ({
    get: (name: string) =>
      ({
        MEDIA_NAMESPACE: 'projects/kookaburra/products',
        MEDIA_S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
        MEDIA_DISK_PUBLIC_BASE_URL: 'https://images.example.com',
        MEDIA_CDN_CF_ZONE_ID: 'a'.repeat(32),
        MEDIA_CDN_CF_API_TOKEN: 'fake-local-test-token-not-real',
        ...override,
      })[name],
  }) as ConfigService<Environment, true>

describe('03C-2C CDN purge with durable-job-friendly failure semantics', () => {
  const id = '42ee5ff8-5bb7-489c-8b0f-6db5a13ed159'
  const key = `projects/kookaburra/products/${id}`
  const url = `https://cdn.example.com/${key}`
  const original = global.fetch
  afterEach(() => {
    global.fetch = original
  })

  it('purges only the exact provider-derived URL after S3 deletion', async () => {
    const calls: Array<{ input: string; init: RequestInit | undefined }> = []
    global.fetch = jest
      .fn()
      .mockImplementation((input: string, init: RequestInit) => {
        calls.push({ input, init })
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        })
      }) as typeof fetch
    await new MediaCdnPurgeService(cfg()).purge('s3', key, url)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input).toBe(
      `https://api.cloudflare.com/client/v4/zones/${'a'.repeat(32)}/purge_cache`,
    )
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ files: [url] })
    expect(
      (calls[0]!.init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer fake-local-test-token-not-real')
  })

  it('does not purge Cloudinary (Cloudinary destroy invalidates itself), even with CDN configured', async () => {
    global.fetch = jest.fn() as typeof fetch
    await new MediaCdnPurgeService(cfg()).purge('cloudinary', key, url)
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it('supports gated disk URLs and rejects a substituted URL without making any network request', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }) as typeof fetch
    const service = new MediaCdnPurgeService(cfg())
    await expect(
      service.purge(
        'disk',
        key,
        `https://images.example.com/v1/media/files/${id}`,
      ),
    ).resolves.toBeUndefined()
    await expect(
      service.purge('disk', key, 'https://attacker.example/media.png'),
    ).rejects.toThrow('differs')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('fails closed when Cloudflare reports failure (durable cleanup job retries)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      }) as typeof fetch
    await expect(
      new MediaCdnPurgeService(cfg()).purge('s3', key, url),
    ).rejects.toThrow('CDN invalidation failed')
  })
  it('remains optional for installations without CDN integration', async () => {
    global.fetch = jest.fn() as typeof fetch
    await new MediaCdnPurgeService(
      cfg({ MEDIA_CDN_CF_ZONE_ID: '', MEDIA_CDN_CF_API_TOKEN: '' }),
    ).purge('s3', key, url)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
