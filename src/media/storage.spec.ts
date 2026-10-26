import { CloudinaryMediaProvider } from './storage'
import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
const factory = () =>
  new CloudinaryMediaProvider({
    get: (key: string) =>
      (
        ({
          MEDIA_CLOUD_NAME: 'sample',
          MEDIA_API_KEY: '123456',
          MEDIA_API_SECRET: 'local-only-secret',
        }) as Record<string, string>
      )[key],
  } as ConfigService<Environment, true>)
describe('03C Cloudinary provider adapter', () => {
  it('signs upload without exposing provider secret', () => {
    const result = factory().signedUpload('projects/sample/products/test-id')
    expect(result.uploadUrl).toBe(
      'https://api.cloudinary.com/v1_1/sample/image/upload',
    )
    expect(result.fields.public_id).toBe('projects/sample/products/test-id')
    expect(result.fields.signature).toMatch(/^[0-9a-f]{40}$/)
    expect(JSON.stringify(result)).not.toContain('local-only-secret')
  })
  it('verifies metadata from provider instead of trusting browser response', async () => {
    const original = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        public_id: 'projects/sample/products/known',
        resource_type: 'image',
        format: 'webp',
        bytes: 500,
        width: 50,
        height: 60,
        asset_id: 'abcdefghijklmnopqrst',
        secure_url:
          'https://res.cloudinary.com/sample/image/upload/v123/projects/sample/products/known.webp',
      }),
    }) as typeof fetch
    try {
      const verified = await factory().verify('projects/sample/products/known')
      expect(verified).toMatchObject({
        mimeType: 'image/webp',
        width: 50,
        bytes: 500,
      })
      await expect(
        factory().verify('projects/sample/products/other'),
      ).rejects.toThrow()
    } finally {
      global.fetch = original
    }
  })
  it('requires confirmed provider delete result; missing is idempotent', async () => {
    const original = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: 'not found' }),
    }) as typeof fetch
    try {
      await expect(
        factory().delete('projects/sample/products/known'),
      ).resolves.toBeUndefined()
    } finally {
      global.fetch = original
    }
  })
})
