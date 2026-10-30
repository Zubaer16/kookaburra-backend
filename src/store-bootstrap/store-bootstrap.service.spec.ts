import type { StoreProfileService } from '../store-profile/store-profile.service'
import type { StoreContentService } from '../store-content/store-content.service'
import type { StoreBrandingService } from '../store-branding/store-branding.service'
import { StoreBootstrapService } from './store-bootstrap.service'

describe('G3/05B-4 public bootstrap: explicit allowlist and no independent state', () => {
  const profile = {
    configured: true,
    storeName: 'Example',
    supportEmail: 'help@example.test',
    websiteUrl: '',
    timezone: 'UTC',
    supportNotice: '',
    updatedAt: 'PRIVATE',
  }
  const content = {
    configured: false,
    seoTitle: '',
    seoDescription: '',
    footerText: '',
    privacyPolicy: '',
    termsOfService: '',
    returnPolicy: '',
    revision: 20,
  }
  const branding = {
    configured: true,
    logo: {
      id: 'valid-id',
      url: 'https://example.test/logo.png',
      mimeType: 'image/png',
      width: 128,
      height: 64,
      providerAssetId: 'SECRET-ASSET-ID',
    },
    favicon: null,
    providerSecret: 'SECRET',
  }
  const service = new StoreBootstrapService(
    {
      publicProfile: jest.fn().mockResolvedValue(profile),
    } as unknown as StoreProfileService,
    {
      publicContent: jest.fn().mockResolvedValue(content),
    } as unknown as StoreContentService,
    {
      publicBranding: jest.fn().mockResolvedValue(branding),
    } as unknown as StoreBrandingService,
  )

  it('composes the independently configured public views and strips future internal fields', async () => {
    const output = await service.get()
    expect(output).toEqual({
      schemaVersion: 1,
      profile: {
        configured: true,
        storeName: 'Example',
        supportEmail: 'help@example.test',
        websiteUrl: '',
        timezone: 'UTC',
        supportNotice: '',
      },
      content: {
        configured: false,
        seoTitle: '',
        seoDescription: '',
        footerText: '',
        privacyPolicy: '',
        termsOfService: '',
        returnPolicy: '',
      },
      branding: {
        configured: true,
        logo: {
          id: 'valid-id',
          url: 'https://example.test/logo.png',
          mimeType: 'image/png',
          width: 128,
          height: 64,
        },
        favicon: null,
      },
    })
    expect(JSON.stringify(output)).not.toMatch(
      /SECRET|revision|updatedAt|providerAssetId/,
    )
  })

  it('propagates source failures rather than returning a misleading partially configured bootstrap', async () => {
    const failure = new Error('unavailable')
    const broken = new StoreBootstrapService(
      { publicProfile: async () => profile } as unknown as StoreProfileService,
      {
        publicContent: async () => {
          throw failure
        },
      } as unknown as StoreContentService,
      {
        publicBranding: async () => branding,
      } as unknown as StoreBrandingService,
    )
    await expect(broken.get()).rejects.toBe(failure)
  })
})
