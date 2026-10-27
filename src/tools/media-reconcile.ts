import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { MediaService } from '../media/media.service'
import { parseMediaReconcileOptions } from '../media/reconcile-options'

async function main() {
  // Validate arguments before opening any database or provider connections.
  const options = parseMediaReconcileOptions(process.argv.slice(2))
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  })
  try {
    const result = await app
      .get(MediaService)
      .reconcileBatch(options.limit, options.apply)
    console.log(JSON.stringify(result))
    if (!options.apply) {
      console.log('READ ONLY: No database or storage changes were made.')
    } else {
      console.log(
        'Deletion jobs were scheduled/repaired only; run media:cleanup separately after retention.',
      )
    }
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Media reconciliation failed; check DB configuration and job state',
  )
  process.exitCode = 1
})
