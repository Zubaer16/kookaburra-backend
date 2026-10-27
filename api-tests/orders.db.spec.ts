import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { DatabaseService } from '../src/database/database.service'
import { OrdersService } from '../src/orders/orders.service'

const countryCode = 'CK'
const currency = 'USD'
const address = {
  recipientName: 'Alex Checkout',
  phone: '+12025550123',
  addressLine1: '23 Testing Way',
  city: 'Testville',
  countryCode,
}

test('04C-1 real DB: order allocation, immutable snapshot, replay, competition, cancel and expiry', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const first = await f.account('CUSTOMER')
    const second = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Order QA', slug: f.slug('orders') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Original title',
        slug: f.slug('order-p'),
        sku: f.sku('order'),
        priceMinor: 500,
        currency,
        status: 'ACTIVE',
        stockOnHand: 5,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId: string = (await product.json()).id
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 50,
        taxBps: 1000,
        enabled: true,
      },
      update: {
        shippingMinor: 50,
        taxBps: 1000,
        freeOverSubtotalMinor: null,
        enabled: true,
      },
    })
    for (const user of [first, second]) {
      expect(
        (
          await request.put('/v1/cart/items', {
            headers: bearer(user.token),
            data: { productId, quantity: 3 },
          })
        ).status(),
      ).toBe(200)
    }
    const reservation = await request.post('/v1/checkout/reservations', {
      headers: bearer(first.token),
      data: { requestId: randomUUID(), countryCode },
    })
    expect(reservation.status()).toBe(200)
    const hold = await reservation.json()
    const key = randomUUID()
    const orderPayload = {
      requestId: key,
      reservationId: hold.id,
      shippingAddress: address,
    }
    const orderCreate = () =>
      request.post('/v1/orders', {
        headers: bearer(first.token),
        data: orderPayload,
      })
    // Concurrent calls using the identical idempotency key yield one order.
    const [result1, result2] = await Promise.all([orderCreate(), orderCreate()])
    expect([result1.status(), result2.status()]).toEqual([200, 200])
    const created = await result1.json()
    expect((await result2.json()).id).toBe(created.id)
    expect(created).toMatchObject({
      status: 'PENDING_PAYMENT',
      currency,
      subtotalMinor: 1500,
      shippingMinor: 50,
      taxMinor: 150,
      totalMinor: 1700,
      payable: false,
      lines: [{ title: 'Original title', quantity: 3, unitPriceMinor: 500 }],
    })
    expect(
      (
        await request.post('/v1/orders', {
          headers: bearer(first.token),
          data: {
            ...orderPayload,
            shippingAddress: { ...address, city: 'Changed' },
          },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post('/v1/orders', {
          headers: bearer(first.token),
          data: { ...orderPayload, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    const latestBalance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { id: balance.id },
    })
    expect(latestBalance.onHand).toBe(5)
    expect(latestBalance.reservedQuantity).toBe(3)
    expect(
      (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockOnHand,
    ).toBe(5)
    expect(
      (
        await f.db.checkoutReservation.findUniqueOrThrow({
          where: { id: hold.id },
        })
      ).status,
    ).toBe('CONSUMED')
    expect(
      (
        await (
          await request.delete(`/v1/checkout/reservations/${hold.id}`, {
            headers: bearer(first.token),
          })
        ).json()
      ).status,
    ).toBe('CONSUMED')
    expect(
      (
        await request.post('/v1/checkout/reservations', {
          headers: bearer(second.token),
          data: { countryCode, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    // Cross-account reads and cancellation cannot reveal the order or its address.
    expect(
      (
        await request.get(`/v1/orders/${created.id}`, {
          headers: bearer(second.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(`/v1/orders/${created.id}/cancel`, {
          headers: bearer(second.token),
        })
      ).status(),
    ).toBe(404)
    // Price/title edits after placement cannot change historical snapshots.
    await f.db.product.update({
      where: { id: productId },
      data: { title: 'New title', priceMinor: 999 },
    })
    const read = await request.get(`/v1/orders/${created.id}`, {
      headers: bearer(first.token),
    })
    expect((await read.json()).lines[0]).toMatchObject({
      title: 'Original title',
      unitPriceMinor: 500,
    })
    expect(
      (
        await request.get('/v1/orders', { headers: bearer(first.token) })
      ).status(),
    ).toBe(200)
    const cancelled = await request.post(`/v1/orders/${created.id}/cancel`, {
      headers: bearer(first.token),
    })
    expect(cancelled.status()).toBe(200)
    expect((await cancelled.json()).status).toBe('CANCELLED')
    expect(
      (
        await request.post(`/v1/orders/${created.id}/cancel`, {
          headers: bearer(first.token),
        })
      ).status(),
    ).toBe(200)
    const afterCancel = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { id: balance.id },
    })
    expect(afterCancel.onHand).toBe(5)
    expect(afterCancel.reservedQuantity).toBe(0)
    // Re-create a reservation/order using the newly unreserved availability.
    const nextHold = await request.post('/v1/checkout/reservations', {
      headers: bearer(second.token),
      data: { countryCode, requestId: randomUUID() },
    })
    expect(nextHold.status()).toBe(200)
    const next = await request.post('/v1/orders', {
      headers: bearer(second.token),
      data: {
        reservationId: (await nextHold.json()).id,
        requestId: randomUUID(),
        shippingAddress: address,
      },
    })
    expect(next.status()).toBe(200)
    const secondOrder = await next.json()
    await f.db.order.update({
      where: { id: secondOrder.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 2000) },
    })
    const worker = new OrdersService({
      client: f.db,
    } as unknown as DatabaseService)
    expect((await worker.expireBatch(20)).expired).toBeGreaterThanOrEqual(1)
    expect((await worker.expireBatch(20)).expired).toBe(0)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: secondOrder.id } }))
        .status,
    ).toBe('EXPIRED')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)
    expect(
      await f.db.inventoryMovement.count({ where: { balanceId: balance.id } }),
    ).toBe(1) // original OPENING; order creation did not create SALE movement
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
