import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ConfigService } from '@nestjs/config'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { PaymentCancellationService } from '../src/payments/payment-cancellation.service'
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

test('04C-2B2A real DB: closed-order Stripe TEST intent cancellation, replay, review and recovery', async ({
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
      data: { name: 'Cancellation Test', slug: f.slug('cancel-cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Safe Cancellation Shirt',
        slug: f.slug('cancel-prod'),
        sku: f.sku('cancel'),
        priceMinor: 500,
        currency,
        status: 'ACTIVE',
        stockOnHand: 6,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 50,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 50,
        taxBps: 0,
        freeOverSubtotalMinor: null,
        enabled: true,
      },
    })
    const config = {
      get: (name: string) => ({ STRIPE_TEST_ENABLED: true })[name],
    } as unknown as ConfigService<Environment, true>
    let providerIntentId = `pi_TestCancel${f.key}987654`
    let cancelCalls = 0
    let remoteStatus = 'canceled'
    let failFirstResponse = false
    let orderId = ''
    let amount = 0
    const providerState = (id: string): VerifiedStripeIntentState => ({
      id,
      status: remoteStatus,
      livemode: false,
      currency,
      orderId,
      amountMinor: amount,
      amountReceivedMinor: remoteStatus === 'succeeded' ? amount : 0,
    })
    const gateway = {
      prepare: async () => ({
        id: providerIntentId,
        status: 'requires_payment_method',
      }),
      cancel: async (id: string) => {
        cancelCalls++
        if (failFirstResponse) {
          failFirstResponse = false
          throw new Error('Simulated provider reply lost')
        }
        return providerState(id)
      },
      retrieve: async (id: string) => providerState(id),
    } as unknown as StripeTestGateway
    const db = { client: f.db } as unknown as DatabaseService
    const payments = new PaymentsService(db, config, gateway)
    const cancellation = new PaymentCancellationService(db, config, gateway)
    const createOrder = async (qty: number) => {
      const cart = await request.put('/v1/cart/items', {
        headers: bearer(customer.token),
        data: { productId, quantity: qty },
      })
      expect(cart.status()).toBe(200)
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
      return (await placed.json()) as { id: string; totalMinor: number }
    }
    const createAndClose = async (qty: number) => {
      const order = await createOrder(qty)
      orderId = order.id
      amount = order.totalMinor
      const prepared = await payments.prepare(customer.id, order.id)
      expect(prepared.preparationStatus).toBe('READY')
      const closed = await request.post(`/v1/orders/${order.id}/cancel`, {
        headers: bearer(customer.token),
      })
      expect(closed.status()).toBe(200)
      return (
        await f.db.paymentAttempt.findUniqueOrThrow({
          where: { orderId: order.id },
        })
      ).id
    }

    const firstId = await createAndClose(2)
    // A lost provider response is not assumed to be failure: retrieve and verify.
    failFirstResponse = true
    expect(await cancellation.cancelAttempt(firstId)).toBe('CANCELLED')
    expect(cancelCalls).toBe(1)
    expect(await cancellation.cancelAttempt(firstId)).toBe('SKIPPED')
    expect(
      (await f.db.paymentAttempt.findUniqueOrThrow({ where: { id: firstId } }))
        .status,
    ).toBe('CANCELLED')
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'payment.test_intent_cancelled',
          payload: { path: ['orderId'], equals: orderId },
        },
      }),
    ).toBe(1)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(6)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)

    providerIntentId = `pi_TestCancelSecond${f.key}987654`
    const secondId = await createAndClose(1)
    remoteStatus = 'succeeded'
    expect(await cancellation.cancelAttempt(secondId)).toBe('REVIEW')
    expect(
      (await f.db.paymentAttempt.findUniqueOrThrow({ where: { id: secondId } }))
        .status,
    ).toBe('REQUIRES_REVIEW')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(6)
    expect(await f.db.paymentTransaction.count({ where: { orderId } })).toBe(0)

    providerIntentId = `pi_TestCancelThird${f.key}987654`
    const thirdId = await createAndClose(1)
    remoteStatus = 'requires_payment_method'
    expect(await cancellation.cancelAttempt(thirdId)).toBe('RETRY')
    const third = await f.db.paymentAttempt.findUniqueOrThrow({
      where: { id: thirdId },
    })
    expect(third.status).toBe('CANCELLING')
    // Force a due retry on this test-owned row only; no sleep or global changes.
    await f.db.paymentAttempt.update({
      where: { id: thirdId },
      data: { cancellationRetryAt: new Date(Date.now() - 1000) },
    })
    remoteStatus = 'canceled'
    expect(await cancellation.cancelAttempt(thirdId)).toBe('CANCELLED')
    expect(
      (await f.db.paymentAttempt.findUniqueOrThrow({ where: { id: thirdId } }))
        .status,
    ).toBe('CANCELLED')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(6)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'SALE' },
      }),
    ).toBe(0)
  } finally {
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
