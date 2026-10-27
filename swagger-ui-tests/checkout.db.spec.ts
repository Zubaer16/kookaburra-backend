import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04B-1 Swagger Chromium: owner policy configuration and customer live estimate', async ({
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
      data: { name: 'Checkout Visual', slug: f.slug('category') },
    })
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Checkout Visual',
        slug: f.slug('visual'),
        sku: f.sku('visual'),
        priceMinor: 2500,
        stockOnHand: 6,
        currency,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(customer.token),
          data: { productId, quantity: 2 },
        })
      ).status(),
    ).toBe(200)
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    await swaggerExecute(page, 'PUT', '/v1/admin/checkout/rates', 200, {
      countryCode,
      currency,
      shippingMinor: 350,
      freeOverSubtotalMinor: null,
      taxBps: 1000,
      enabled: true,
    })
    await swaggerExecute(page, 'GET', '/v1/admin/checkout/rates', 200)
    await openSwagger(page)
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(page, 'POST', '/v1/checkout/estimate', 400, {
      countryCode: 'not-country',
    })
    const result = await swaggerExecute(
      page,
      'POST',
      '/v1/checkout/estimate',
      200,
      { countryCode },
    )
    expect(await result.json()).toMatchObject({
      subtotalMinor: 5000,
      shippingMinor: 350,
      taxMinor: 500,
      estimatedTotalMinor: 5850,
      reservationStatus: 'NOT_RESERVED',
      payable: false,
    })
  } finally {
    if (prior) {
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: prior.shippingMinor,
          freeOverSubtotalMinor: prior.freeOverSubtotalMinor,
          taxBps: prior.taxBps,
          enabled: prior.enabled,
        },
      })
    } else {
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    }
    await f.close()
  }
})
