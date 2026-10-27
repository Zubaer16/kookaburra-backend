import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
import { authorizeGuestCartInSwagger, authorizeInSwagger, openSwagger, swaggerExecute } from './swagger-helper'

test('04A-2 Swagger Chromium: guest capability, validation, merge with JWT and replay safety', async ({ page, request }) => {
  test.setTimeout(240_000)
  const f = new CatalogTestFixture(request)
  let guestId: string | null = null
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token), data: { name: 'Visual Guest', slug: f.slug('category') },
    })
    const created = await request.post('/v1/admin/products', {
      headers: bearer(owner.token), data: {
        title: 'Visual Guest Product', slug: f.slug('tee'), sku: f.sku('tee'),
        priceMinor: 2000, currency: 'USD', stockOnHand: 8, status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(created.status()).toBe(201)
    const productId = (await created.json()).id as string
    const guest = await (await request.post('/v1/guest-cart')).json()
    guestId = guest.guestCartId as string
    await openSwagger(page)
    // Swagger UI will not dispatch a request with a missing required header.
    // Verify missing-token protection via real HTTP, and exercise invalid-token
    // rejection through the actual Swagger Try it out → Execute UI.
    expect((await request.get('/v1/guest-cart')).status()).toBe(401)
    // Exercise malformed capability rejection through HTTP as well. For the
    // Swagger browser test use a correctly shaped but unissued capability: it
    // must pass Swagger's parameter validation, reach the API, and get 401.
    expect((await request.get('/v1/guest-cart', {
      headers: { 'X-Guest-Cart-Token': 'invalid' },
    })).status()).toBe(401)
    // Swagger's Authorize modal owns the guest capability as an API-key
    // security scheme. It must reach the server with its exact header value.
    const invalidToken = 'A'.repeat(43)
    await authorizeGuestCartInSwagger(page, invalidToken)
    const rejected = await swaggerExecute(page, 'GET', '/v1/guest-cart', 401)
    expect(rejected.request().headers()['x-guest-cart-token'] === invalidToken).toBe(true)

    // Fresh Swagger page avoids relying on modal Logout/re-authorize behavior.
    await openSwagger(page)
    await authorizeGuestCartInSwagger(page, guest.guestToken)
    const accepted = await swaggerExecute(page, 'GET', '/v1/guest-cart', 200)
    expect(accepted.request().headers()['x-guest-cart-token'] === guest.guestToken).toBe(true)
    await swaggerExecute(page, 'PUT', '/v1/guest-cart/items', 400,
      { productId, quantity: 0 })
    await swaggerExecute(page, 'PUT', '/v1/guest-cart/items', 200,
      { productId, quantity: 2 })
    await swaggerExecute(page, 'GET', '/v1/guest-cart/quote', 200)
    await swaggerExecute(page, 'POST', '/v1/cart/merge', 401, { guestToken: guest.guestToken })
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(page, 'POST', '/v1/cart/merge', 200, { guestToken: guest.guestToken })
    await swaggerExecute(page, 'POST', '/v1/cart/merge', 200, { guestToken: guest.guestToken })
    const consumed = await swaggerExecute(page, 'GET', '/v1/guest-cart', 401)
    expect(consumed.request().headers()['x-guest-cart-token'] === guest.guestToken).toBe(true)
    const quote = await (await request.get('/v1/cart', { headers: bearer(customer.token) })).json()
    expect(quote.items).toHaveLength(1)
    expect(quote.items[0].quantity).toBe(2)
    expect(quote.subtotalMinor).toBe(4000)
  } finally {
    if (guestId) await f.db.guestCart.deleteMany({ where: { id: guestId } })
    await f.close()
  }
})
