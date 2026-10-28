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
    ],
  })
  preparationStatus!: string
  @ApiProperty({ type: 'integer' }) amountMinor!: number
  @ApiProperty({ example: 'USD' }) currency!: string
  @ApiProperty({ example: false }) canConfirm!: false
  @ApiProperty({ example: false }) payable!: false
}
