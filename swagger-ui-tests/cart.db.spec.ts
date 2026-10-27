import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
import { authorizeInSwagger, openSwagger, swaggerExecute } from './swagger-helper'

test('04A Swagger Chromium: customer cart JWT, live quote, idempotent quantity, delete and invalid data', async ({ page, request }) => {
  test.setTimeout(240_000)
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', { headers: bearer(owner.token), data: { name: '04A', slug: f.slug('category') } })
    expect(category.status()).toBe(201)
    const productResponse = await request.post('/v1/admin/products', { headers: bearer(owner.token), data: {
      title: 'Visual Cart Tee', slug: f.slug('tee'), sku: f.sku('tee'), priceMinor: 1599,
      currency: 'USD', stockOnHand: 10, status: 'ACTIVE', categoryIds: [(await category.json()).id],
    } })
    expect(productResponse.status()).toBe(201)
    const productId = (await productResponse.json()).id as string
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/cart', 401)
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(page, 'GET', '/v1/cart', 200)
    await swaggerExecute(page, 'PUT', '/v1/cart/items', 400, { productId, quantity: 0 })
    await swaggerExecute(page, 'PUT', '/v1/cart/items', 200, { productId, quantity: 2 })
    await swaggerExecute(page, 'PUT', '/v1/cart/items', 200, { productId, quantity: 2 })
    await swaggerExecute(page, 'GET', '/v1/cart/quote', 200)
    const quote = await (await request.get('/v1/cart/quote', { headers: bearer(customer.token) })).json()
    expect(quote.items).toHaveLength(1)
    expect(quote.items[0].quantity).toBe(2)
    expect(quote.subtotalMinor).toBe(3198)
    expect(quote.amountDueMinor).toBeNull()
    await swaggerExecute(page, 'DELETE', '/v1/cart/items/{id}', 200, undefined, { id: quote.items[0].id })
    await swaggerExecute(page, 'DELETE', '/v1/cart', 200)
  } finally { await f.close() }
})
