import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const countryCode = 'CK'
const currency = 'USD'
const address = {
  recipientName: 'Ledger Test',
  phone: '+12025550123',
  addressLine1: '9 Example Road',
  city: 'Example',
  countryCode,
}

test('04C-2B2C1 real PostgreSQL: partial refunds, ceilings, concurrent requests, replay and immutable PAID stock', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const secondCustomer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Ledger Category', slug: f.slug('refund-cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Refund Ledger Product',
        slug: f.slug('refund-prod'),
        sku: f.sku('refund'),
        priceMinor: 400,
        currency,
        status: 'ACTIVE',
        stockOnHand: 4,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
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
        enabled: true,
        freeOverSubtotalMinor: null,
      },
    })
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(customer.token),
          data: { productId, quantity: 2 },
        })
      ).status(),
    ).toBe(200)
    const hold = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { countryCode, requestId: randomUUID() },
    })
    expect(hold.status()).toBe(200)
    const ordered = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: address,
      },
    })
    expect(ordered.status()).toBe(200)
    const order = (await ordered.json()) as { id: string; totalMinor: number }
    const uri = `/v1/admin/payments/orders/${order.id}/refunds`
    const firstKey = randomUUID()
    expect(
      (
        await request.post(uri, {
          headers: bearer(owner.token),
          data: {
            requestId: firstKey,
            amountMinor: 100,
            reason: 'OTHER',
          },
        })
      ).status(),
    ).toBe(409) // Unpaid order cannot create refund requests.
    const intentId = `pi_TestRefundLedger${f.key}123456`
    const attempt = await f.db.paymentAttempt.create({
      data: {
        orderId: order.id,
        providerIntentId: intentId,
        idempotencyKey: `qa-refund-${f.key}`,
        status: 'SETTLED',
        amountMinor: order.totalMinor,
        currency,
      },
    })
    await f.db.paymentTransaction.create({
      data: {
        orderId: order.id,
        paymentAttemptId: attempt.id,
        providerIntentId: intentId,
        amountMinor: order.totalMinor,
        currency,
      },
    })
    await f.db.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    })
    const beforeBalance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    const first = await request.post(uri, {
      headers: bearer(owner.token),
      data: { requestId: firstKey, amountMinor: 100, reason: 'OTHER' },
    })
    expect(first.status()).toBe(200)
    const firstResult = (await first.json()) as {
      id: string
      providerRefundSubmitted: boolean
      stockReturned: boolean
    }
    expect(firstResult.providerRefundSubmitted).toBe(false)
    expect(firstResult.stockReturned).toBe(false)
    const replay = await request.post(uri, {
      headers: bearer(owner.token),
      data: { requestId: firstKey, amountMinor: 100, reason: 'OTHER' },
    })
    expect(replay.status()).toBe(200)
    expect((await replay.json()).id).toBe(firstResult.id)
    expect(
      (
        await request.post(uri, {
          headers: bearer(owner.token),
          data: { requestId: firstKey, amountMinor: 101, reason: 'OTHER' },
        })
      ).status(),
    ).toBe(409)
    const max = order.totalMinor - 100
    const [a, b] = await Promise.all([
      request.post(uri, {
        headers: bearer(owner.token),
        data: {
          requestId: randomUUID(),
          amountMinor: max,
          reason: 'CUSTOMER_REQUEST',
        },
      }),
      request.post(uri, {
        headers: bearer(owner.token),
        data: {
          requestId: randomUUID(),
          amountMinor: max,
          reason: 'CUSTOMER_REQUEST',
        },
      }),
    ])
    expect([a.status(), b.status()].sort()).toEqual([200, 409])
    expect(
      (
        await request.post(uri, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID(), amountMinor: 1, reason: 'OTHER' },
        })
      ).status(),
    ).toBe(409)
    expect(
      await f.db.refundRequest.count({ where: { orderId: order.id } }),
    ).toBe(2)
    const list = await request.get(`/v1/payments/orders/${order.id}/refunds`, {
      headers: bearer(customer.token),
    })
    expect(list.status()).toBe(200)
    expect((await list.json()).length).toBe(2)
    expect(
      (
        await request.get(`/v1/payments/orders/${order.id}/refunds`, {
          headers: bearer(secondCustomer.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PAID')
    const afterBalance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    expect(afterBalance.onHand).toBe(beforeBalance.onHand)
    expect(afterBalance.reservedQuantity).toBe(beforeBalance.reservedQuantity)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: beforeBalance.id, reason: 'SALE' },
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
