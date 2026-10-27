import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04A-2: guest token isolation, no JWT escalation, malformed capability, unknown fields and customer-only merge', async ({ request }) => {
  const f = new CatalogTestFixture(request)
  const guestIds: string[] = []
  try {
    const a = await (await request.post('/v1/guest-cart')).json()
    const b = await (await request.post('/v1/guest-cart')).json()
    guestIds.push(a.guestCartId, b.guestCartId)
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const aHeaders = { 'X-Guest-Cart-Token': a.guestToken }
    const bHeaders = { 'X-Guest-Cart-Token': b.guestToken }
    expect((await request.get('/v1/guest-cart')).status()).toBe(401)
    expect((await request.get('/v1/guest-cart', { headers: { 'X-Guest-Cart-Token': 'invalid' } })).status()).toBe(401)
    expect((await request.get('/v1/guest-cart', { headers: aHeaders })).status()).toBe(200)
    expect((await request.get('/v1/guest-cart', { headers: bHeaders })).status()).toBe(200)
    expect((await request.get('/v1/cart', { headers: aHeaders })).status()).toBe(401)
    expect((await request.post('/v1/cart/merge', { data: { guestToken: a.guestToken } })).status()).toBe(401)
    expect((await request.post('/v1/cart/merge', { headers: bearer(staff.token), data: { guestToken: a.guestToken } })).status()).toBe(403)
    for (const data of [{ guestToken: 'not-token' }, { guestToken: a.guestToken, userId: customer.id }, { guestToken: 7 }]) {
      expect((await request.post('/v1/cart/merge', { headers: bearer(customer.token), data })).status()).toBe(400)
    }
    for (const data of [{ productId: 'not-uuid', quantity: 1 }, { productId: '11111111-1111-4111-8111-111111111111', quantity: 100 }, { productId: '11111111-1111-4111-8111-111111111111', quantity: 1, priceMinor: 0 }]) {
      expect((await request.put('/v1/guest-cart/items', { headers: aHeaders, data })).status()).toBe(400)
    }
    const unknown = await request.put('/v1/guest-cart/items', { headers: bHeaders, data: { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 } })
    expect(unknown.status()).toBe(409)
    const forceRead = await request.get('/v1/cart/quote', { headers: { Authorization: `Bearer ${a.guestToken}` } })
    expect(forceRead.status()).toBe(401)
  } finally {
    await f.db.guestCart.deleteMany({ where: { id: { in: guestIds } } })
    await f.close()
  }
})
