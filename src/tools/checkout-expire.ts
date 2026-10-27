import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { ReservationService } from '../checkout/reservation.service'
import { OrdersService } from '../orders/orders.service'

async function main() {
  // Explicit operator-run command; can be called by cron/Task Scheduler.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  })
  try {
    const service = app.get(ReservationService)
    let expired = 0
    for (let i = 0; i < 100; i++) {
      const batch = await service.expireBatch(50)
      expired += batch.expired
      if (batch.expired < 50) break
    }
    const orders = app.get(OrdersService)
    let ordersExpired = 0
    for (let i = 0; i < 100; i++) {
      const batch = await orders.expireBatch(50)
      ordersExpired += batch.expired
      if (batch.expired < 50) break
    }
    console.log(JSON.stringify({ expired, ordersExpired }))
  } finally {
    await app.close()
  }
}
void main().catch(() => {
  console.error(
    'Checkout expiry failed; verify database connectivity, reservations and order allocations',
  )
  process.exitCode = 1
})
