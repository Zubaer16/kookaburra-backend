import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04C-1 Swagger Chromium: unpaid order create/replay/read/cancel with strict DTO validation', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000)
  const f = new CatalogTestFixture(request)
  const countryCode = 'CK'
  const currency = 'USD'
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Order Swagger', slug: f.slug('order-cat') },
    })
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Order Swagger Product',
        slug: f.slug('order-product'),
        sku: f.sku('order'),
        status: 'ACTIVE',
        priceMinor: 700,
        currency,
        stockOnHand: 5,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
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
        freeOverSubtotalMinor: null,
        taxBps: 0,
        enabled: true,
      },
    })
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(customer.token),
          data: { productId: (await product.json()).id, quantity: 2 },
        })
      ).status(),
    ).toBe(200)
    const holdResult = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { requestId: randomUUID(), countryCode },
    })
    expect(holdResult.status()).toBe(200)
    const hold = await holdResult.json()
    const payload = {
      requestId: randomUUID(),
      reservationId: hold.id,
      shippingAddress: {
        recipientName: 'Visual Test',
        phone: '+12025550123',
        addressLine1: '1 Automation Street',
        city: 'Testville',
        countryCode,
      },
    }
    await openSwagger(page)
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(page, 'POST', '/v1/orders', 400, {
      ...payload,
      totalMinor: 1,
    })
    const placed = await swaggerExecute(
      page,
      'POST',
      '/v1/orders',
      200,
      payload,
    )
    const order = await placed.json()
    expect(order).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalMinor: 1450,
      payable: false,
    })
    const replay = await swaggerExecute(
      page,
      'POST',
      '/v1/orders',
      200,
      payload,
    )
    expect((await replay.json()).id).toBe(order.id)
    await swaggerExecute(page, 'GET', '/v1/orders/{id}', 200, undefined, {
      id: order.id,
    })
    const cancel = await swaggerExecute(
      page,
      'POST',
      '/v1/orders/{id}/cancel',
      200,
      undefined,
      { id: order.id },
    )
    expect((await cancel.json()).status).toBe('CANCELLED')
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
