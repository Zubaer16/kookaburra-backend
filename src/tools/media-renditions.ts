import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { MediaRenditionService } from '../media/media-rendition.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    const worker = app.get(MediaRenditionService)
    const enqueued = await worker.backfill(50)
    const result = await worker.processBatch(10)
    console.log(JSON.stringify({ enqueued, ...result }))
    if (result.failed) process.exitCode = 1
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Media renditions worker failed; check DB/provider configuration',
  )
  process.exitCode = 1
})
