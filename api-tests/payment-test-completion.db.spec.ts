import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ConfigService } from '@nestjs/config'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { PaymentTestCompletionService } from '../src/payments/payment-test-completion.service'
import { PaymentsService } from '../src/payments/payments.service'
import { DatabaseService } from '../src/database/database.service'
import { Environment } from '../src/config/environment'
import {
  StripeTestGateway,
  VerifiedStripeIntentState,
} from '../src/payments/stripe-gateway'

const countryCode = 'CK'
const currency = 'USD'
const address = {
  recipientName: 'Test Customer',
  phone: '+12025550123',
  addressLine1: '5 Safe Test Road',
  city: 'Exampletown',
  countryCode,
}

test('04C-2B2B real DB: test-only confirm/capture, exactly-once and held stock until signed settlement', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Sandbox Auth Test', slug: f.slug('auth-cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Sandbox Test Shirt',
        slug: f.slug('auth-prod'),
        sku: f.sku('auth'),
        priceMinor: 600,
        currency,
        status: 'ACTIVE',
        stockOnHand: 5,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId: (await product.json()).id as string },
    })
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 20,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 20,
        taxBps: 0,
        freeOverSubtotalMinor: null,
        enabled: true,
      },
    })
    const item = await request.put('/v1/cart/items', {
      headers: bearer(customer.token),
      data: { productId: (await product.json()).id, quantity: 2 },
    })
    expect(item.status()).toBe(200)
    const hold = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { countryCode, requestId: randomUUID() },
    })
    expect(hold.status()).toBe(200)
    const placed = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: address,
      },
    })
    expect(placed.status()).toBe(200)
    const order = (await placed.json()) as { id: string; totalMinor: number }
    const intentId = `pi_TestCapture${f.key}123456`
    let status = 'requires_payment_method'
    let received = 0
    let confirmCalls = 0
    let captureCalls = 0
    const remote = (): VerifiedStripeIntentState => ({
      id: intentId,
      status,
      amountMinor: order.totalMinor,
      amountReceivedMinor: received,
      currency,
      orderId: order.id,
      livemode: false,
    })
    const gateway = {
      prepare: async () => ({ id: intentId, status }),
      retrieve: async () => remote(),
      confirmTestCard: async () => {
        confirmCalls++
        status = 'requires_capture'
        return remote()
      },
      captureTest: async () => {
        captureCalls++
        status = 'succeeded'
        received = order.totalMinor
        return remote()
      },
    } as unknown as StripeTestGateway
    const config = {
      get: (name: string) =>
        ({
          STRIPE_TEST_ENABLED: true,
          STRIPE_TEST_CHECKOUT_ENABLED: true,
          NODE_ENV: 'test',
        })[name as 'NODE_ENV'],
    } as unknown as ConfigService<Environment, true>
    const db = { client: f.db } as unknown as DatabaseService
    const payments = new PaymentsService(db, config, gateway)
    const prepared = await payments.prepare(customer.id, order.id)
    expect(prepared.preparationStatus).toBe('READY')
    const completion = new PaymentTestCompletionService(db, config, gateway)
    const first = await completion.complete(customer.id, order.id)
    expect(first.state).toBe('AWAITING_WEBHOOK')
    expect(first.paid).toBe(false)
    const replay = await completion.complete(customer.id, order.id)
    expect(replay).toEqual(first)
    expect(confirmCalls).toBe(1)
    expect(captureCalls).toBe(1)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PENDING_PAYMENT')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(5)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'SALE' },
      }),
    ).toBe(0)
    expect(
      (
        await request.post(`/v1/orders/${order.id}/cancel`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(409)
    // A delayed webhook must not let the unpaid-order expiry worker free a captured allocation.
    await f.db.order.update({
      where: { id: order.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 1000) },
    })
    const { OrdersService } = await import('../src/orders/orders.service')
    await new OrdersService(db).expireBatch(20)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PENDING_PAYMENT')
    // A TEST-origin review is also fenced; different legacy review cases are unaffected.
    await f.db.paymentAttempt.update({
      where: { orderId: order.id },
      data: { status: 'REQUIRES_REVIEW' },
    })
    expect(
      (
        await request.post(`/v1/orders/${order.id}/cancel`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(409)
  } finally {
    // Fake gateway only: release test-owned in-progress marks before fixture teardown.
    await f.db.paymentAttempt.updateMany({
      where: {
        order: { customer: { email: { startsWith: `catalog-${f.key}-` } } },
        status: {
          in: [
            'CONFIRMING',
            'CAPTURING',
            'AWAITING_WEBHOOK',
            'REQUIRES_REVIEW',
          ],
        },
        testCompletionAttempts: { gt: 0 },
      },
      data: { status: 'READY', testCompletionStartedAt: null },
    })
    if (prior)
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: prior.shippingMinor,
          freeOverSubtotalMinor: prior.freeOverSubtotalMinor,
          taxBps: prior.taxBps,
          enabled: prior.enabled,
        },
      })
    else
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.close()
  }
})
