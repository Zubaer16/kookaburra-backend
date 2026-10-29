import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsUUID, Matches } from 'class-validator'

/** All replacement actions must carry caller-generated stable UUIDs for replay. */
export class ReplacementActionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Unique action UUID; reuse on exact retry',
  })
  @IsUUID()
  requestId!: string
}

export class ShipReplacementDto extends ReplacementActionDto {
  @ApiProperty({ example: 'DHL', maxLength: 80 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._&-]{1,79}$/)
  carrier!: string

  @ApiProperty({ example: 'REPL123456', maxLength: 120 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/)
  trackingNumber!: string
}

export class ReplacementResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty({ format: 'uuid' }) returnId!: string
  @ApiProperty({ format: 'uuid' }) productId!: string
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) variantId!:
    | string
    | null
  @ApiPropertyOptional({ type: String, nullable: true }) skuSnapshot!:
    | string
    | null
  @ApiProperty({ minimum: 1 }) quantity!: number
  @ApiProperty({ enum: ['AUTHORIZED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] })
  status!: string
  @ApiPropertyOptional({ type: String, nullable: true }) carrier!: string | null
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNumber!:
    | string
    | null
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  shippedAt!: Date | null
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date
}
