import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04B-2 Swagger Chromium: reservation create/read/replay/release and validation', async ({
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
    const user = await f.account('CUSTOMER')
    const auth = bearer(owner.token)
    const cat = await request.post('/v1/admin/categories', {
      headers: auth,
      data: { name: 'Reservation Visual', slug: f.slug('cat') },
    })
    const product = await request.post('/v1/admin/products', {
      headers: auth,
      data: {
        title: 'Reservation Visual',
        slug: f.slug('p'),
        sku: f.sku('visual'),
        stockOnHand: 5,
        priceMinor: 1000,
        status: 'ACTIVE',
        currency,
        categoryIds: [(await cat.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 100,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 100,
        taxBps: 0,
        freeOverSubtotalMinor: null,
        enabled: true,
      },
    })
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(user.token),
          data: {
            productId: (await product.json()).id,
            quantity: 2,
          },
        })
      ).status(),
    ).toBe(200)
    await openSwagger(page)
    await authorizeInSwagger(page, user.token)
    const req = { countryCode, requestId: randomUUID() }
    await swaggerExecute(page, 'POST', '/v1/checkout/reservations', 400, {
      ...req,
      subtotalMinor: 1,
    })
    const created = await swaggerExecute(
      page,
      'POST',
      '/v1/checkout/reservations',
      200,
      req,
    )
    const reserved = await created.json()
    expect(reserved).toMatchObject({
      status: 'ACTIVE',
      subtotalMinor: 2000,
      estimatedTotalMinor: 2100,
      payable: false,
    })
    const replay = await swaggerExecute(
      page,
      'POST',
      '/v1/checkout/reservations',
      200,
      req,
    )
    expect((await replay.json()).id).toBe(reserved.id)
    await swaggerExecute(
      page,
      'GET',
      '/v1/checkout/reservations/{id}',
      200,
      undefined,
      { id: reserved.id },
    )
    const released = await swaggerExecute(
      page,
      'DELETE',
      '/v1/checkout/reservations/{id}',
      200,
      undefined,
      { id: reserved.id },
    )
    expect((await released.json()).status).toBe('RELEASED')
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
