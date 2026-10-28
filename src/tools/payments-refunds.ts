import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { RefundExecutionService } from '../payments/refund-execution.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  })
  try {
    console.log(
      JSON.stringify(await app.get(RefundExecutionService).processBatch(10)),
    )
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Stripe TEST refund worker failed. Verify TEST-only credentials, database target and flagged requests.',
  )
  process.exitCode = 1
})
