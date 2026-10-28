import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const countryCode = 'CK'
const currency = 'USD'

test('04D-1 real DB: paid-only one-shipment lifecycle, idempotency, cross-customer, no stock mutation', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const stranger = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Fulfillment QA', slug: f.slug('ship-cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Fulfillment QA Item',
        slug: f.slug('ship-product'),
        sku: f.sku('ship'),
        priceMinor: 400,
        currency,
        status: 'ACTIVE',
        stockOnHand: 5,
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
    const reservation = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { countryCode, requestId: randomUUID() },
    })
    expect(reservation.status()).toBe(200)
    const orderResponse = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await reservation.json()).id,
        shippingAddress: {
          recipientName: 'Fulfillment QA',
          phone: '+12025550123',
          addressLine1: '1 Test Avenue',
          city: 'Testville',
          countryCode,
        },
      },
    })
    expect(orderResponse.status()).toBe(200)
    const orderId = (await orderResponse.json()).id as string
    const beginUrl = `/v1/admin/orders/${orderId}/fulfillment/start`
    const beginPayload = { requestId: randomUUID() }
    expect(
      (
        await request.post(beginUrl, {
          headers: bearer(owner.token),
          data: beginPayload,
        })
      ).status(),
    ).toBe(409)
    const intentId = `pi_Fulfillment${f.key}12345`
    const attempt = await f.db.paymentAttempt.create({
      data: {
        orderId,
        providerIntentId: intentId,
        idempotencyKey: `qa-ship-${f.key}`,
        status: 'SETTLED',
        amountMinor: (await orderResponse.json()).totalMinor,
        currency,
      },
    })
    await f.db.paymentTransaction.create({
      data: {
        orderId,
        paymentAttemptId: attempt.id,
        providerIntentId: intentId,
        amountMinor: (await orderResponse.json()).totalMinor,
        currency,
      },
    })
    await f.db.order.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date() },
    })
    const balanceBefore = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    const movementsBefore = await f.db.inventoryMovement.count({
      where: { balanceId: balanceBefore.id },
    })
    const [beginA, beginB] = await Promise.all([
      request.post(beginUrl, {
        headers: bearer(owner.token),
        data: beginPayload,
      }),
      request.post(beginUrl, {
        headers: bearer(owner.token),
        data: beginPayload,
      }),
    ])
    expect([beginA.status(), beginB.status()]).toEqual([200, 200])
    expect((await beginA.json()).status).toBe('PROCESSING')
    expect((await beginB.json()).id).toBe((await beginA.json()).id)
    expect(
      (
        await request.post(beginUrl, {
          headers: bearer(owner.token),
          data: { ...beginPayload, requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    const shipUrl = `/v1/admin/orders/${orderId}/fulfillment/ship`
    const shipPayload = {
      requestId: randomUUID(),
      carrier: 'UPS',
      trackingNumber: 'TRACK12345',
    }
    expect(
      (
        await request.post(`/v1/admin/orders/${orderId}/fulfillment/deliver`, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    const shipped = await request.post(shipUrl, {
      headers: bearer(owner.token),
      data: shipPayload,
    })
    expect(shipped.status()).toBe(200)
    expect((await shipped.json()).status).toBe('SHIPPED')
    expect(
      (
        await request.post(shipUrl, {
          headers: bearer(owner.token),
          data: { ...shipPayload, trackingNumber: 'CHANGED' },
        })
      ).status(),
    ).toBe(409)
    const delivered = await request.post(
      `/v1/admin/orders/${orderId}/fulfillment/deliver`,
      {
        headers: bearer(owner.token),
        data: { requestId: randomUUID() },
      },
    )
    expect(delivered.status()).toBe(200)
    expect((await delivered.json()).status).toBe('DELIVERED')
    const own = await request.get(`/v1/orders/${orderId}`, {
      headers: bearer(customer.token),
    })
    expect(own.status()).toBe(200)
    expect((await own.json()).fulfillment).toMatchObject({
      status: 'DELIVERED',
      carrier: 'UPS',
      trackingNumber: 'TRACK12345',
    })
    expect(
      (
        await request.get(`/v1/orders/${orderId}`, {
          headers: bearer(stranger.token),
        })
      ).status(),
    ).toBe(404)
    const adminList = await request.get('/v1/admin/orders?page=1&limit=10', {
      headers: bearer(owner.token),
    })
    expect(adminList.status()).toBe(200)
    expect(
      (await adminList.json()).items.some(
        (item: { id: string }) => item.id === orderId,
      ),
    ).toBe(true)
    expect(await f.db.orderShipmentEvent.count({ where: { orderId } })).toBe(3)
    const after = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    expect(after.onHand).toBe(balanceBefore.onHand)
    expect(after.reservedQuantity).toBe(balanceBefore.reservedQuantity)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balanceBefore.id },
      }),
    ).toBe(movementsBefore)
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
