import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { OrderFulfillmentResponseDto } from './fulfillment.dto'
import { Type } from 'class-transformer'
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

/** Recipient and delivery fields are saved as a historical snapshot, not an address book. */
export class OrderShippingAddressDto {
  @ApiProperty({ example: 'Alex Sample', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipientName!: string

  @ApiProperty({
    example: '+12025550123',
    description: 'Contact phone; not an authentication credential',
  })
  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/)
  phone!: string

  @ApiProperty({ example: '1 Example Street', maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  addressLine1!: string

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string

  @ApiProperty({ example: 'New York', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @ApiProperty({ example: 'US' })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string
}

export class CreateOrderDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'New client UUID; same request and payload returns the same order',
  })
  @IsUUID()
  requestId!: string

  @ApiProperty({
    format: 'uuid',
    description: 'Owned, ACTIVE, unexpired checkout reservation',
  })
  @IsUUID()
  reservationId!: string

  @ApiProperty({ type: OrderShippingAddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => OrderShippingAddressDto)
  shippingAddress!: OrderShippingAddressDto
}

export class OrderQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}

export class OrderLineResponseDto {
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiProperty({ format: 'uuid', nullable: true }) variantId!: string | null
  @ApiProperty() title!: string
  @ApiProperty({ nullable: true }) sku!: string | null
  @ApiProperty({ description: 'Serialized immutable options JSON' })
  optionsSnapshotJson!: string
  @ApiProperty({ type: 'integer' }) quantity!: number
  @ApiProperty({ type: 'integer' }) unitPriceMinor!: number
  @ApiProperty({ type: 'integer' }) lineTotalMinor!: number
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) reservationId!: string
  @ApiProperty({ format: 'uuid' }) requestId!: string
  @ApiProperty({ enum: ['PENDING_PAYMENT', 'CANCELLED', 'EXPIRED', 'PAID'] })
  status!: string
  @ApiProperty({ example: 'US' }) countryCode!: string
  @ApiProperty({ example: 'USD' }) currency!: string
  @ApiProperty({ type: 'integer' }) subtotalMinor!: number
  @ApiProperty({ type: 'integer' }) shippingMinor!: number
  @ApiProperty({ type: 'integer' }) taxMinor!: number
  @ApiProperty({ type: 'integer' }) totalMinor!: number
  @ApiProperty({ type: OrderShippingAddressDto })
  shippingAddress!: OrderShippingAddressDto
  @ApiProperty({ type: [OrderLineResponseDto] }) lines!: OrderLineResponseDto[]
  @ApiProperty({ type: String, format: 'date-time' }) paymentDeadlineAt!: Date
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null
  @ApiProperty({
    example: false,
    description:
      'Not a payable checkout action. Payment confirmation is not exposed in this phase',
  })
  payable!: false
  @ApiPropertyOptional({ type: OrderFulfillmentResponseDto, nullable: true })
  fulfillment!: OrderFulfillmentResponseDto | null
}
