import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { PaymentCancellationService } from '../payments/payment-cancellation.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  })
  try {
    const worker = app.get(PaymentCancellationService)
    console.log(JSON.stringify(await worker.cancelBatch(25)))
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Stripe TEST cancellation failed. Verify database target and test credentials; review flagged attempts.',
  )
  process.exitCode = 1
})
