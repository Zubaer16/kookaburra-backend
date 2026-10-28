import { expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { ReservationService } from '../src/checkout/reservation.service'
import { OrdersService } from '../src/orders/orders.service'
import { DatabaseService } from '../src/database/database.service'

/** Shared isolation/cleanup for Catalog visual, security and HTTP integration
 * tests. Never connect outside the guarded LOCAL kookaburra_api_test database.
 */
export function catalogTestDatabase(): PrismaClient {
  const connection = process.env.DATABASE_URL
  if (
    process.env.API_TEST_MODE !== 'db' ||
    process.env.API_TEST_PORT !== '4101' ||
    !connection
  )
    throw new Error(
      'Use guarded npm run test:api:visual:all or test:api:security',
    )
  const url = new URL(connection)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    decodeURIComponent(url.pathname.slice(1)) !== 'kookaburra_api_test'
  )
    throw new Error('Refusing nonlocal, production or dev DB')
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: connection }),
  })
}

export type CatalogRole = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'OWNER'
export class CatalogTestFixture {
  readonly key = randomUUID().slice(0, 8)
  readonly db = catalogTestDatabase()
  private readonly emails: string[] = []

  constructor(private readonly request: APIRequestContext) {}

  slug(label: string): string {
    return `qa-${this.key}-${label}`
  }
  sku(label: string): string {
    return `QA-${this.key}-${label}`.toUpperCase()
  }

  async account(role: CatalogRole) {
    const email = `catalog-${this.key}-${role.toLowerCase()}-${randomUUID()}@example.test`
    const password = `Catalog-${randomUUID()}-Aa1!`
    this.emails.push(email)
    const registered = await this.request.post('/v1/auth/register', {
      data: { email, password },
    })
    expect(registered.status()).toBe(201)
    const created = (await registered.json()) as {
      user: { id: string }
      accessToken: string
    }
    if (role !== 'CUSTOMER') {
      await this.db.user.update({
        where: { id: created.user.id },
        data: { role },
      })
      const login = await this.request.post('/v1/admin/auth/login', {
        data: { email, password },
      })
      expect(login.status()).toBe(200)
      const data = (await login.json()) as { accessToken: string }
      return { id: created.user.id, token: data.accessToken, email }
    }
    return { id: created.user.id, token: created.accessToken, email }
  }

  async close() {
    try {
      // Own namespace only; no DB reset, no globally destructive delete.
      const products = await this.db.product.findMany({
        where: { slug: { startsWith: `qa-${this.key}-` } },
        select: { id: true },
      })
      const productIds = products.map((product) => product.id)
      // Reservations (including released history) reference SKU balance rows
      // with RESTRICT. Remove only this fixture's customer holds first.
      const fixtureUsers = await this.db.user.findMany({
        where: { email: { in: this.emails } },
        select: { id: true },
      })
      const fixtureUserIds = fixtureUsers.map((user) => user.id)
      if (fixtureUserIds.length) {
        // Pending order allocations also contribute to reserved_quantity.
        // Cancel them through production transactional logic before fixture deletion.
        const fixtureOrders = await this.db.order.findMany({
          where: { customerId: { in: fixtureUserIds } },
          select: { id: true, customerId: true, status: true },
        })
        const ordersService = new OrdersService({
          client: this.db,
        } as unknown as DatabaseService)
        for (const order of fixtureOrders) {
          if (order.status === 'PENDING_PAYMENT')
            await ordersService.cancel(order.customerId, order.id)
          // Remove ONLY this fixture's transactional outbox records.
          await this.db.outboxEvent.deleteMany({
            where: {
              eventType: {
                in: [
                  'order.created',
                  'order.cancelled',
                  'order.expired',
                  'payment.test_intent_prepared',
                  'payment.test_settled',
                  'payment.test_review_required',
                ],
              },
              payload: { path: ['orderId'], equals: order.id },
            },
          })
        }
        // Phase 04C-2A: FK-restricted payment attempts must be removed only
        // for this fixture before deleting its orders (never global cleanup).
        await this.db.paymentTransaction.deleteMany({
          where: { order: { customerId: { in: fixtureUserIds } } },
        })
        await this.db.paymentAttempt.deleteMany({
          where: {
            order: { customerId: { in: fixtureUserIds } },
          },
        })
        await this.db.order.deleteMany({
          where: { customerId: { in: fixtureUserIds } },
        })
        // Even a failed assertion must not leak reserved stock into later tests.
        // Release with the production service before deleting fixture history.
        const active = await this.db.checkoutReservation.findMany({
          where: { customerId: { in: fixtureUserIds }, status: 'ACTIVE' },
          select: { id: true, customerId: true },
        })
        const reservations = new ReservationService({
          client: this.db,
        } as unknown as DatabaseService)
        for (const hold of active)
          await reservations.release(hold.customerId, hold.id)
        await this.db.checkoutReservation.deleteMany({
          where: { customerId: { in: fixtureUserIds } },
        })
      }
      if (productIds.length) {
        await this.db.productVariant.deleteMany({
          where: { productId: { in: productIds } },
        })
        await this.db.product.deleteMany({ where: { id: { in: productIds } } })
      }
      // Children must be removed before parents.
      const categories = await this.db.category.findMany({
        where: { slug: { startsWith: `qa-${this.key}-` } },
        select: { id: true },
      })
      const ids = categories.map((category) => category.id)
      if (ids.length) {
        await this.db.category.updateMany({
          where: { id: { in: ids } },
          data: { parentId: null },
        })
        await this.db.category.deleteMany({ where: { id: { in: ids } } })
      }
      const actors = await this.db.user.findMany({
        where: { email: { in: this.emails } },
        select: { id: true },
      })
      const actorIds = actors.map((actor) => actor.id)
      if (actorIds.length) {
        await this.db.auditEvent.deleteMany({
          where: { actorId: { in: actorIds } },
        })
        await this.db.user.deleteMany({ where: { id: { in: actorIds } } })
      }
    } finally {
      await this.db.$disconnect()
    }
  }
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function assertSafeError(
  response: { status(): number; json(): Promise<unknown> },
  code: number,
) {
  expect(response.status()).toBe(code)
  const payload = await response.json()
  const serialized = JSON.stringify(payload)
  expect(serialized).not.toMatch(
    /PrismaClient|stack trace|passwordHash|DATABASE_URL|SELECT\s+.+FROM/i,
  )
  return payload
}
