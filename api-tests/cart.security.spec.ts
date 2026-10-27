import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04A JWT only, customer ownership, malformed data, mass assignment and stock limits', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const auth = bearer(customer.token)
    for (const path of ['/v1/cart', '/v1/cart/quote']) {
      expect((await request.get(path)).status()).toBe(401)
      expect(
        (await request.get(path, { headers: bearer(staff.token) })).status(),
      ).toBe(403)
      expect(
        (
          await request.get(path, {
            headers: { Authorization: 'Bearer invalid.jwt.token' },
          })
        ).status(),
      ).toBe(401)
    }
    const validId = '11111111-1111-4111-8111-111111111111'
    const invalid = [
      { productId: validId, quantity: 0 },
      { productId: validId, quantity: -1 },
      { productId: validId, quantity: 100 },
      { productId: validId, quantity: 1.3 },
      { productId: validId, quantity: '3' },
      { productId: 'not-uuid', quantity: 2 },
      { productId: validId, variantId: 'not-uuid', quantity: 2 },
      { productId: validId, quantity: 1, priceMinor: 1 },
      { productId: validId, quantity: 1, userId: customer.id },
      { productId: validId, quantity: 1, stockOnHand: 99999 },
    ]
    for (const data of invalid) {
      const response = await request.put('/v1/cart/items', {
        headers: auth,
        data,
      })
      expect(response.status(), JSON.stringify(data)).toBe(400)
    }
    expect(
      (
        await request.put('/v1/cart/items', {
          data: { productId: validId, quantity: 1 },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(staff.token),
          data: { productId: validId, quantity: 1 },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: auth,
          data: { productId: validId, quantity: 1 },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.delete(`/v1/cart/items/${validId}`, { headers: auth })
      ).status(),
    ).toBe(404)
    expect((await request.delete('/v1/cart', { headers: auth })).status()).toBe(
      200,
    )
  } finally {
    await f.close()
  }
})
