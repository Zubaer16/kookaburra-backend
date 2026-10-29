import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const countryCode = 'XT'
const currency = 'USD'

test('04D-2B-2 real DB: customer-owned timeline joins shipment, inspected return and replacement without exposing PII', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const cat = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Tracking Test', slug: f.slug('tracking-cat') },
    })
    expect(cat.status()).toBe(201)
    const prod = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Tracking Test SKU',
        slug: f.slug('tracking-product'),
        sku: f.sku('tracking'),
        priceMinor: 2000,
        currency,
        status: 'ACTIVE',
        stockOnHand: 8,
        categoryIds: [(await cat.json()).id],
      },
    })
    expect(prod.status()).toBe(201)
    const productId = (await prod.json()).id as string
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 0,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 0,
        taxBps: 0,
        enabled: true,
        freeOverSubtotalMinor: null,
      },
    })
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(customer.token),
          data: { productId, quantity: 1 },
        })
      ).status(),
    ).toBe(200)
    const hold = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { requestId: randomUUID(), countryCode },
    })
    expect(hold.status()).toBe(200)
    const placed = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: {
          recipientName: 'PRIVATE TRACKING RECIPIENT',
          phone: '+12025550123',
          addressLine1: 'PRIVATE ADDRESS 45',
          city: 'Sample City',
          countryCode,
        },
      },
    })
    expect(placed.status()).toBe(200)
    const order = await placed.json()
    const orderId = order.id as string
    const customerUrl = `/v1/orders/${orderId}/tracking`
    const adminUrl = `/v1/admin/orders/${orderId}/tracking`
    const pending = await request.get(customerUrl, {
      headers: bearer(customer.token),
    })
    expect(pending.status()).toBe(200)
    expect((await pending.json()).originalShipment).toBeNull()
    expect(
      (
        await request.get(customerUrl, { headers: bearer(other.token) })
      ).status(),
    ).toBe(404)
    expect(
      (await request.get(adminUrl, { headers: bearer(other.token) })).status(),
    ).toBe(403)

    // Local test-only fixture: payment provider is not contacted or accepted here.
    const providerIntentId = `pi_tracking_${f.key}`
    const payment = await f.db.paymentAttempt.create({
      data: {
        orderId,
        providerIntentId,
        idempotencyKey: `tracking-test-${f.key}`,
        status: 'SETTLED',
        amountMinor: order.totalMinor,
        currency,
      },
    })
    await f.db.paymentTransaction.create({
      data: {
        orderId,
        paymentAttemptId: payment.id,
        providerIntentId,
        amountMinor: order.totalMinor,
        currency,
      },
    })
    await f.db.order.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date() },
    })
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    await f.db.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHand: 7, reservedQuantity: 0 },
    })
    await f.db.product.update({
      where: { id: productId },
      data: { stockOnHand: 7 },
    })
    const act = (action: string, data: object) =>
      request.post(`/v1/admin/orders/${orderId}/fulfillment/${action}`, {
        headers: bearer(owner.token),
        data,
      })
    expect((await act('start', { requestId: randomUUID() })).status()).toBe(200)
    expect(
      (
        await act('ship', {
          requestId: randomUUID(),
          carrier: 'UPS',
          trackingNumber: 'ORIGINAL123',
        })
      ).status(),
    ).toBe(200)
    expect((await act('deliver', { requestId: randomUUID() })).status()).toBe(
      200,
    )
    const requested = await request.post(`/v1/orders/${orderId}/returns`, {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        orderLineId: order.lines[0].id,
        quantity: 1,
        reason: 'OTHER',
      },
    })
    expect(requested.status()).toBe(200)
    const returnId = (await requested.json()).id as string
    const returnAction = (action: string, data: object) =>
      request.post(
        `/v1/admin/orders/${orderId}/returns/${returnId}/${action}`,
        { headers: bearer(owner.token), data },
      )
    expect(
      (await returnAction('approve', { requestId: randomUUID() })).status(),
    ).toBe(200)
    expect(
      (
        await returnAction('receive', {
          requestId: randomUUID(),
          condition: 'DAMAGED',
        })
      ).status(),
    ).toBe(200)
    const approved = await request.post(
      `/v1/admin/orders/${orderId}/replacements/returns/${returnId}/authorize`,
      {
        headers: bearer(owner.token),
        data: { requestId: randomUUID() },
      },
    )
    expect(approved.status()).toBe(200)
    const replacementId = (await approved.json()).id as string
    const dispatched = await request.post(
      `/v1/admin/orders/${orderId}/replacements/${replacementId}/ship`,
      {
        headers: bearer(owner.token),
        data: {
          requestId: randomUUID(),
          carrier: 'DHL',
          trackingNumber: 'REPLACE1234',
        },
      },
    )
    expect(dispatched.status()).toBe(200)
    const response = await request.get(customerUrl, {
      headers: bearer(customer.token),
    })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.orderStatus).toBe('PAID')
    expect(body.originalShipment).toMatchObject({
      status: 'DELIVERED',
      trackingNumber: 'ORIGINAL123',
    })
    expect(body.returns).toEqual([
      expect.objectContaining({
        id: returnId,
        status: 'RECEIVED_DAMAGED',
        quantity: 1,
      }),
    ])
    expect(body.replacements).toEqual([
      expect.objectContaining({
        id: replacementId,
        status: 'SHIPPED',
        trackingNumber: 'REPLACE1234',
      }),
    ])
    expect(body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'SHIPMENT', status: 'DELIVERED' }),
        expect.objectContaining({ type: 'RETURN', status: 'RECEIVED_DAMAGED' }),
        expect.objectContaining({ type: 'REPLACEMENT', status: 'SHIPPED' }),
      ]),
    )
    for (let i = 1; i < body.events.length; i++) {
      expect(Date.parse(body.events[i].occurredAt)).toBeGreaterThanOrEqual(
        Date.parse(body.events[i - 1].occurredAt),
      )
    }
    const content = JSON.stringify(body)
    for (const secret of [
      'PRIVATE TRACKING RECIPIENT',
      'PRIVATE ADDRESS 45',
      'shippingAddress',
      'totalMinor',
      'customerId',
      'requestHash',
      'actorId',
      'providerIntentId',
    ]) {
      expect(content).not.toContain(secret)
    }
    const admin = await request.get(adminUrl, { headers: bearer(owner.token) })
    expect(admin.status()).toBe(200)
    expect(await admin.json()).toEqual(body)
    expect(
      (
        await request.get(customerUrl, { headers: bearer(other.token) })
      ).status(),
    ).toBe(404)
  } finally {
    if (previous) {
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: previous.shippingMinor,
          taxBps: previous.taxBps,
          freeOverSubtotalMinor: previous.freeOverSubtotalMinor,
          enabled: previous.enabled,
        },
      })
    } else {
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    }
    await f.close()
  }
})
