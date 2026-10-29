import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** Read-only, PII-free delivery and recovery view (original order + returns + replacements). */
export class TrackingEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ enum: ['ORDER', 'SHIPMENT', 'RETURN', 'REPLACEMENT'] })
  type!: string
  @ApiProperty({ format: 'uuid' }) referenceId!: string
  @ApiProperty({ example: 'SHIPPED' }) status!: string
  @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: Date
}

export class TrackingShipmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ enum: ['PROCESSING', 'SHIPPED', 'DELIVERED'] })
  status!: string
  @ApiPropertyOptional({ type: String, nullable: true }) carrier!: string | null
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNumber!:
    | string
    | null
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  shippedAt!: Date | null
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null
}

export class TrackingReturnDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) orderLineId!: string
  @ApiProperty({ type: 'integer', minimum: 1 }) quantity!: number
  @ApiProperty({
    enum: [
      'REQUESTED',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'RECEIVED_RESTOCKABLE',
      'RECEIVED_DAMAGED',
      'RESTOCKED',
    ],
  })
  status!: string
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date
}

export class TrackingReplacementDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) returnId!: string
  @ApiProperty({ type: 'integer', minimum: 1 }) quantity!: number
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
}

export class OrderTrackingResponseDto {
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty({ enum: ['PENDING_PAYMENT', 'CANCELLED', 'EXPIRED', 'PAID'] })
  orderStatus!: string
  @ApiProperty({ type: TrackingShipmentDto, nullable: true })
  originalShipment!: TrackingShipmentDto | null
  @ApiProperty({ type: [TrackingReturnDto] }) returns!: TrackingReturnDto[]
  @ApiProperty({ type: [TrackingReplacementDto] })
  replacements!: TrackingReplacementDto[]
  @ApiProperty({ type: [TrackingEventDto] }) events!: TrackingEventDto[]
}
