import { createHmac, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { DatabaseService } from '../src/database/database.service'
import { Environment } from '../src/config/environment'
import { PaymentsService } from '../src/payments/payments.service'
import { PaymentSettlementService } from '../src/payments/payment-settlement.service'
import { StripeTestGateway } from '../src/payments/stripe-gateway'

const countryCode = 'CK'
const currency = 'USD'
const secret = 'whsec_TESTONLY12345678901234567890'
const address = {
  recipientName: 'Test Customer',
  phone: '+12025550123',
  addressLine1: '5 Payment Test Road',
  city: 'Exampletown',
  countryCode,
}

// Both PAYMENT and RECONCILIATION use mock provider doubles in the guarded
// real-PostgreSQL API test DB, NEVER external Stripe or live credentials.
test('04C-2B1 real DB: Stripe-confirmed settlement, ledger/mirrors, replay, late success review', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const eventIds: string[] = []
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Settlement Test', slug: f.slug('settlement-cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Settlement Test Shirt',
        slug: f.slug('settlement-p'),
        sku: f.sku('settlement'),
        priceMinor: 500,
        currency,
        status: 'ACTIVE',
        stockOnHand: 4,
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
      get: (name: string) =>
        ({
          STRIPE_TEST_ENABLED: true,
          STRIPE_TEST_WEBHOOK_SECRET: secret,
        })[name],
    } as unknown as ConfigService<Environment, true>
    let nextProviderId = `pi_TestSettlement${f.key}987654`
    let currentOrderId = ''
    let currentAmount = 0
    let providerStatus = 'succeeded'
    let providerAmountOffset = 0
    const gateway = {
      prepare: async () => ({
        id: nextProviderId,
        status: 'requires_payment_method',
      }),
      retrieve: async (id: string) => ({
        id,
        status: providerStatus,
        amountMinor: currentAmount,
        amountReceivedMinor: currentAmount + providerAmountOffset,
        currency,
        orderId: currentOrderId,
        livemode: false,
      }),
    } as unknown as StripeTestGateway
    const payments = new PaymentsService(
      { client: f.db } as unknown as DatabaseService,
      config,
      gateway,
    )
    const settlement = new PaymentSettlementService(
      { client: f.db } as unknown as DatabaseService,
      config,
      gateway,
    )

    const orderNew = async (quantity: number) => {
      expect(
        (
          await request.put('/v1/cart/items', {
            headers: bearer(customer.token),
            data: { productId, quantity },
          })
        ).status(),
      ).toBe(200)
      const hold = await request.post('/v1/checkout/reservations', {
        headers: bearer(customer.token),
        data: { countryCode, requestId: randomUUID() },
      })
      expect(hold.status()).toBe(200)
      const resp = await request.post('/v1/orders', {
        headers: bearer(customer.token),
        data: {
          requestId: randomUUID(),
          reservationId: (await hold.json()).id,
          shippingAddress: address,
        },
      })
      expect(resp.status()).toBe(200)
      return (await resp.json()) as { id: string; totalMinor: number }
    }
    const receipt = async (id: string) => {
      const eventId = `evt_TestSettlement${randomUUID().replaceAll('-', '').slice(0, 20)}`
      eventIds.push(eventId)
      const raw = Buffer.from(
        JSON.stringify({
          id: eventId,
          type: 'payment_intent.succeeded',
          livemode: false,
          data: { object: { object: 'payment_intent', id } },
        }),
      )
      const t = Math.floor(Date.now() / 1000)
      const sig = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex')}`
      expect(await payments.receiveWebhook(raw, sig)).toEqual({
        received: true,
      })
      return (
        await f.db.paymentWebhookReceipt.findUniqueOrThrow({
          where: { providerEventId: eventId },
        })
      ).id
    }

    const first = await orderNew(2)
    currentOrderId = first.id
    currentAmount = first.totalMinor
    await payments.prepare(customer.id, first.id)
    const firstReceipt = await receipt(nextProviderId)
    expect(await settlement.reconcileReceipt(firstReceipt)).toBe('SETTLED')
    expect(await settlement.reconcileReceipt(firstReceipt)).toBe('SKIPPED')
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe('PAID')
    expect(
      await f.db.paymentTransaction.count({ where: { orderId: first.id } }),
    ).toBe(1)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'SALE' },
      }),
    ).toBe(1)
    const after = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { id: balance.id },
    })
    expect(after.onHand).toBe(2)
    expect(after.reservedQuantity).toBe(0)
    expect(
      (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockOnHand,
    ).toBe(2)
    expect(
      (
        await request.get(`/v1/orders/${first.id}`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post(`/v1/orders/${first.id}/cancel`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(409)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe('PAID')

    // A DIFFERENT signed event for the same paid provider intent must not double-charge stock.
    const duplicateReceipt = await receipt(nextProviderId)
    expect(await settlement.reconcileReceipt(duplicateReceipt)).toBe('SETTLED')
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'SALE' },
      }),
    ).toBe(1)

    // A failed amount verification gets quarantined for manual review, no stock movement.
    nextProviderId = `pi_TestSettlementSecond${f.key}987654`
    const second = await orderNew(1)
    currentOrderId = second.id
    currentAmount = second.totalMinor
    await payments.prepare(customer.id, second.id)
    const mismatchReceipt = await receipt(nextProviderId)
    providerAmountOffset = 1
    expect(await settlement.reconcileReceipt(mismatchReceipt)).toBe('REVIEW')
    expect(
      (
        await f.db.paymentWebhookReceipt.findUniqueOrThrow({
          where: { id: mismatchReceipt },
        })
      ).status,
    ).toBe('REQUIRES_REVIEW')
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: second.id } })).status,
    ).toBe('PENDING_PAYMENT')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(2)
    providerAmountOffset = 0
    expect(
      (
        await request.post(`/v1/orders/${second.id}/cancel`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(200)
    // Late successful intent cannot restore a cancelled/expired allocation.
    const lateReceipt = await receipt(nextProviderId)
    expect(await settlement.reconcileReceipt(lateReceipt)).toBe('REVIEW')
    expect(
      await f.db.paymentTransaction.count({ where: { orderId: second.id } }),
    ).toBe(0)
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
    ).toBe(2)

    // Provider status other than 'succeeded' may be retried, but never settled.
    providerStatus = 'requires_capture'
    const stale = await receipt(nextProviderId)
    expect(await settlement.reconcileReceipt(stale)).toBe('RETRY')
    expect(
      (
        await f.db.paymentWebhookReceipt.findUniqueOrThrow({
          where: { id: stale },
        })
      ).status,
    ).toBe('RECEIVED')
  } finally {
    await f.db.paymentWebhookReceipt.deleteMany({
      where: { providerEventId: { in: eventIds } },
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
