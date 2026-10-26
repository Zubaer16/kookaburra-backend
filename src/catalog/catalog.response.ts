import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CatalogMoneyResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0, example: 2500 })
  amountMinor!: number
  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency' })
  currency!: string
}

export class CatalogCategoryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() slug!: string
  @ApiProperty() name!: string
  @ApiProperty({ nullable: true, type: String }) parentId!: string | null
  @ApiProperty({ example: '#EAF0FF' }) color!: string
  @ApiProperty({ minimum: 0 }) sortOrder!: number
  @ApiProperty() active!: boolean
}

/** Existing response properties remain available; only integration-critical
 * projection fields are documented here. Media fields follow in Phase 03C.
 */
export class CatalogProductResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() slug!: string
  @ApiProperty({
    description: 'English-only title; frontend wraps in {en: title}',
  })
  title!: string
  @ApiProperty() description!: string
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] }) status!: string
  @ApiProperty({
    type: [String],
    description: 'Canonical UUID category references',
  })
  categoryIds!: string[]
  @ApiProperty({ type: CatalogMoneyResponseDto })
  price!: CatalogMoneyResponseDto
  @ApiPropertyOptional({ type: CatalogMoneyResponseDto })
  compareAt?: CatalogMoneyResponseDto
  @ApiProperty({
    description:
      'Display hint only; checkout must verify stock and quote on server',
  })
  purchasable!: boolean
  @ApiProperty({
    description:
      'Size/color variant records include `available` and effective `price`',
    type: [Object],
  })
  variants!: object[]
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cover image URL; null when no gallery image',
  })
  image!: string | null
  @ApiProperty({
    type: [Object],
    description:
      'Verified public image URLs, ordered by position; src/alt for Storefront',
  })
  gallery!: object[]
  @ApiProperty({
    type: [Object],
    description: 'Alias of gallery; id/url/alt for Admin integration',
  })
  images!: object[]
  @ApiProperty({ example: 'Just in' }) badge!: string
  @ApiPropertyOptional({ enum: ['new', 'popular', 'sale'], nullable: true })
  tag?: string | null
}

export class CatalogProductPageResponseDto {
  @ApiProperty({ type: [CatalogProductResponseDto] })
  items!: CatalogProductResponseDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
  @ApiProperty({
    description: 'Alias for limit, for paginated frontend adapters',
  })
  pageSize!: number
  @ApiProperty() pages!: number
}
