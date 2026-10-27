import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator'

/** PUT means set the absolute quantity; retries do not double-add. */
export class SetCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf(
    (obj: SetCartItemDto) =>
      obj.variantId !== null && obj.variantId !== undefined,
  )
  @IsUUID()
  variantId?: string | null

  @ApiProperty({ minimum: 1, maximum: 99, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number
}

export class CartLineResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiProperty({ format: 'uuid', nullable: true }) variantId!: string | null
  @ApiProperty() title!: string
  @ApiProperty({ nullable: true, type: String }) sku!: string | null
  @ApiProperty() quantity!: number
  @ApiProperty() availableQuantity!: number
  @ApiProperty() unitPriceMinor!: number
  @ApiProperty() lineTotalMinor!: number
  @ApiProperty() currency!: string
  @ApiProperty({
    enum: [
      'AVAILABLE',
      'OUT_OF_STOCK',
      'UNPUBLISHED',
      'VARIANT_INVALID',
      'CURRENCY_MISMATCH',
    ],
  })
  status!: string
}

export class CartQuoteResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true }) cartId!: string | null
  @ApiProperty({ type: [CartLineResponseDto] }) items!: CartLineResponseDto[]
  @ApiProperty({ nullable: true, type: String }) currency!: string | null
  @ApiProperty() subtotalMinor!: number
  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Null if any line cannot be purchased; tax/shipping not yet quoted.',
  })
  amountDueMinor!: number | null
  @ApiProperty() checkoutReady!: boolean
  @ApiProperty({ type: [String] }) issues!: string[]
  @ApiProperty({
    description: 'Live calculation time; quote does not reserve stock.',
  })
  quotedAt!: string
}

/** Opaque guest cart capability, NOT a customer access JWT. Never log this token. */
export class MergeGuestCartDto {
  @ApiProperty({
    description:
      'The 43-character guest capability returned by POST /v1/guest-cart',
    minLength: 43,
    maxLength: 43,
  })
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  guestToken!: string
}

export class GuestCartCreatedDto {
  @ApiProperty({
    description: 'Random capability shown only once; do not include in URLs',
  })
  guestToken!: string
  @ApiProperty({ format: 'uuid' }) guestCartId!: string
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string
}
