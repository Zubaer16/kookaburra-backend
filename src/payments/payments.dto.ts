import { ApiProperty } from '@nestjs/swagger'

export class PaymentPreparationResponseDto {
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty({ example: 'STRIPE_TEST' }) provider!: string
  @ApiProperty({ nullable: true, example: 'pi_3FakeTestIdentifier12345' })
  providerIntentId!: string | null
  @ApiProperty({
    enum: [
      'CREATING',
      'READY',
      'REQUIRES_REVIEW',
      'SETTLED',
      'CANCELLING',
      'CANCELLED',
      'CONFIRMING',
      'CAPTURING',
      'AWAITING_WEBHOOK',
    ],
  })
  preparationStatus!: string
  @ApiProperty({ type: 'integer' }) amountMinor!: number
  @ApiProperty({ example: 'USD' }) currency!: string
  @ApiProperty({ example: false }) canConfirm!: false
  @ApiProperty({ example: false }) payable!: false
}

/** No client_secret, no card data, no claim that the order is paid. */
export class TestCardCompletionResponseDto {
  @ApiProperty({ format: 'uuid' }) orderId!: string
  @ApiProperty({ example: true }) testMode!: true
  @ApiProperty({ enum: ['AWAITING_WEBHOOK', 'SETTLED', 'REQUIRES_REVIEW'] })
  state!: string
  @ApiProperty({ example: false }) paid!: boolean
  @ApiProperty({ example: true }) settlementPending!: boolean
}
