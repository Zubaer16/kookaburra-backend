import { ApiProperty } from '@nestjs/swagger'
import { PublicStoreProfileDto } from '../store-profile/store-profile.dto'
import { PublicStoreContentDto } from '../store-content/store-content.dto'
import { PublicStoreBrandingDto } from '../store-branding/store-branding.dto'

/** A read-only composition of three already public G3 contracts.
 * Internal revisions, audit history and provider secrets are never included.
 */
export class PublicStoreBootstrapDto {
  @ApiProperty({
    type: 'integer',
    example: 1,
    enum: [1],
    description: 'Projection schema version (not a cache revision)',
  })
  schemaVersion!: 1

  @ApiProperty({ type: PublicStoreProfileDto })
  profile!: PublicStoreProfileDto

  @ApiProperty({ type: PublicStoreContentDto })
  content!: PublicStoreContentDto

  @ApiProperty({ type: PublicStoreBrandingDto })
  branding!: PublicStoreBrandingDto
}
