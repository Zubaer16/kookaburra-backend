import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator'

export class WishlistMergeDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: 100,
    description:
      'Distinct canonical product UUIDs from an existing local preview wishlist; never use fixture product IDs.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  productIds!: string[]
}

export class WishlistProductDto {
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiProperty() slug!: string
  @ApiProperty() title!: string
  @ApiProperty() currency!: string
  @ApiProperty({ type: Number, minimum: 0 }) priceMinor!: number
  @ApiProperty({ format: 'date-time' }) addedAt!: string
}

export class WishlistResponseDto {
  @ApiProperty({ type: [WishlistProductDto] }) items!: WishlistProductDto[]
  @ApiProperty({ type: Number, maximum: 100 }) count!: number
}

export class WishlistRemoveResponseDto {
  @ApiProperty() removed!: boolean
}
