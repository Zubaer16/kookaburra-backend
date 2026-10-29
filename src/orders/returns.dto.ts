import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator'

export const returnReasons = [
  'DAMAGED',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'OTHER',
] as const

export class CreateOrderReturnDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Stable idempotency UUID for this return request',
  })
  @IsUUID()
  requestId!: string

  @ApiProperty({
    format: 'uuid',
    description: 'Order line ID from the customer order detail',
  })
  @IsUUID()
  orderLineId!: string

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number

  @ApiProperty({ enum: returnReasons })
  @IsIn([...returnReasons])
  reason!: (typeof returnReasons)[number]
}

export class ReturnActionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Unique action UUID, reused for exact retries',
  })
  @IsUUID()
  requestId!: string
}

export class ReceiveReturnDto extends ReturnActionDto {
  @ApiProperty({
    enum: ['RESTOCKABLE', 'DAMAGED'],
    description: 'Physical item inspection outcome',
  })
  @IsIn(['RESTOCKABLE', 'DAMAGED'])
  condition!: 'RESTOCKABLE' | 'DAMAGED'
}

export class OrderReturnResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty({ format: 'uuid' }) orderLineId!: string
  @ApiProperty({ minimum: 1 }) quantity!: number
  @ApiProperty({ enum: returnReasons }) reason!: string
  @ApiProperty({
    enum: [
      'REQUESTED',
      'APPROVED',
      'REJECTED',
      'RECEIVED_RESTOCKABLE',
      'RECEIVED_DAMAGED',
      'RESTOCKED',
    ],
  })
  status!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date
}
