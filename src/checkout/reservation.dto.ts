import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsUUID, Matches } from 'class-validator'

export class CreateReservationDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Client-generated UUID; retries return the original hold and never double-reserve',
  })
  @IsUUID()
  requestId!: string

  @ApiProperty({ example: 'US' })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string
}

export class CheckoutReservationLineDto {
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiProperty({ format: 'uuid', nullable: true }) variantId!: string | null
  @ApiProperty({ type: 'integer' }) quantity!: number
  @ApiProperty({ type: 'integer' }) unitPriceMinor!: number
}

export class CheckoutReservationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) cartId!: string
  @ApiProperty({ format: 'uuid' }) requestId!: string
  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED', 'RELEASED', 'CONSUMED'] })
  status!: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CONSUMED'
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date
  @ApiProperty({ example: 'US' }) countryCode!: string
  @ApiProperty({ example: 'USD' }) currency!: string
  @ApiProperty({ type: 'integer' }) subtotalMinor!: number
  @ApiProperty({ type: 'integer' }) shippingMinor!: number
  @ApiProperty({ type: 'integer' }) taxMinor!: number
  @ApiProperty({ type: 'integer' }) estimatedTotalMinor!: number
  @ApiProperty({ type: [CheckoutReservationLineDto] })
  items!: CheckoutReservationLineDto[]
  @ApiProperty({
    example: false,
    description:
      'No order/payment exists; reserved stock is not a payable checkout',
  })
  payable!: false
}
