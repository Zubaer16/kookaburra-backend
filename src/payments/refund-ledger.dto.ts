import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator'

export class CreateRefundRequestDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'OWNER-provided idempotency UUID; one ledger entry per order and key',
  })
  @IsUUID()
  requestId!: string

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 2147483647,
    description:
      'Refund amount in integer minor units; NOT sent to Stripe in this phase',
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  amountMinor!: number

  @ApiProperty({
    enum: ['CUSTOMER_REQUEST', 'DUPLICATE', 'FRAUDULENT', 'OTHER'],
  })
  @IsIn(['CUSTOMER_REQUEST', 'DUPLICATE', 'FRAUDULENT', 'OTHER'])
  reason!: 'CUSTOMER_REQUEST' | 'DUPLICATE' | 'FRAUDULENT' | 'OTHER'
}

export class RefundRequestResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty({ format: 'uuid' }) requestId!: string
  @ApiProperty({ type: 'integer' }) amountMinor!: number
  @ApiProperty({ example: 'USD' }) currency!: string
  @ApiProperty({
    enum: ['CUSTOMER_REQUEST', 'DUPLICATE', 'FRAUDULENT', 'OTHER'],
  })
  reason!: string
  @ApiProperty({
    enum: ['REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REQUIRES_REVIEW'],
  })
  status!: string
  @ApiProperty({
    example: false,
    description: 'No provider refund is created by this request',
  })
  providerRefundSubmitted!: false
  @ApiProperty({
    example: false,
    description: 'Stock is never returned by this operation',
  })
  stockReturned!: false
}
