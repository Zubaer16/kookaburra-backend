import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { MediaService } from '../media/media.service'

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    const result = await app.get(MediaService).cleanupBatch(20)
    console.log(JSON.stringify(result))
    if (result.failed) process.exitCode = 1
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error('Media cleanup failed; review DB/provider availability')
  process.exitCode = 1
})
