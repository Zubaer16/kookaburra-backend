import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { PaymentSettlementService } from '../payments/payment-settlement.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  })
  try {
    const runner = app.get(PaymentSettlementService)
    const result = await runner.reconcileBatch(25)
    console.log(JSON.stringify(result))
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Stripe test reconciliation failed. Verify test-mode configuration and review pending payment receipts.',
  )
  process.exitCode = 1
})
