import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator'

/** A complete replacement; null means detach. Never accept URLs or provider IDs. */
export class PutStoreBrandingDto {
  @ApiProperty({ minimum: 0, description: 'Latest revision; 0 on first save' })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  @ValidateIf((_obj, value: unknown) => value !== null)
  @IsUUID()
  logoMediaId!: string | null

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  @ValidateIf((_obj, value: unknown) => value !== null)
  @IsUUID()
  faviconMediaId!: string | null
}

export class PublicBrandAssetDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ type: String }) url!: string
  @ApiProperty() mimeType!: string
  @ApiProperty() width!: number
  @ApiProperty() height!: number
}

export class PublicStoreBrandingDto {
  @ApiProperty() configured!: boolean
  @ApiProperty({ type: PublicBrandAssetDto, nullable: true })
  logo!: PublicBrandAssetDto | null
  @ApiProperty({ type: PublicBrandAssetDto, nullable: true })
  favicon!: PublicBrandAssetDto | null
}

export class AdminStoreBrandingDto extends PublicStoreBrandingDto {
  @ApiProperty({ minimum: 0 }) revision!: number
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  updatedAt!: string | null
}
