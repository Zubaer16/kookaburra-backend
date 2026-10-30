import { Injectable } from '@nestjs/common'
import { StoreProfileService } from '../store-profile/store-profile.service'
import { StoreContentService } from '../store-content/store-content.service'
import { StoreBrandingService } from '../store-branding/store-branding.service'
import type { PublicStoreBootstrapDto } from './store-bootstrap.dto'

/** Compose the existing public projections. Never query raw profile/content/media
 * rows here: each source service enforces its own public privacy contract.
 * G3 storefront presentation fields are not authority for payment/shipping/CORS.
 */
@Injectable()
export class StoreBootstrapService {
  constructor(
    private readonly profile: StoreProfileService,
    private readonly content: StoreContentService,
    private readonly branding: StoreBrandingService,
  ) {}

  async get(): Promise<PublicStoreBootstrapDto> {
    const [profile, content, branding] = await Promise.all([
      this.profile.publicProfile(),
      this.content.publicContent(),
      this.branding.publicBranding(),
    ])
    // Explicit output allowlists defend against accidental future additions to
    // the underlying public methods (e.g. revisions or providerAssetId).
    const asset = (value: typeof branding.logo) =>
      value
        ? {
            id: value.id,
            url: value.url,
            mimeType: value.mimeType,
            width: value.width,
            height: value.height,
          }
        : null
    return {
      schemaVersion: 1,
      profile: {
        configured: profile.configured,
        storeName: profile.storeName,
        supportEmail: profile.supportEmail,
        websiteUrl: profile.websiteUrl,
        timezone: profile.timezone,
        supportNotice: profile.supportNotice,
      },
      content: {
        configured: content.configured,
        seoTitle: content.seoTitle,
        seoDescription: content.seoDescription,
        footerText: content.footerText,
        privacyPolicy: content.privacyPolicy,
        termsOfService: content.termsOfService,
        returnPolicy: content.returnPolicy,
      },
      branding: {
        configured: branding.configured,
        logo: asset(branding.logo),
        favicon: asset(branding.favicon),
      },
    }
  }
}
