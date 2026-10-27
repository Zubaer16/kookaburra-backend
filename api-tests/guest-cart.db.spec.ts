import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04A-2: anonymous quantity, private ownership, exactly-once customer merge and live repricing', async ({ request }) => {
  const f = new CatalogTestFixture(request)
  const guestIds: string[] = []
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const cat = await request.post('/v1/admin/categories', { headers: bearer(owner.token), data: { name: '04A2', slug: f.slug('guest') } })
    expect(cat.status()).toBe(201)
    const p = await request.post('/v1/admin/products', { headers: bearer(owner.token), data: {
      title: 'Guest Tee', slug: f.slug('tee'), sku: f.sku('tee'), priceMinor: 1300,
      currency: 'USD', stockOnHand: 10, status: 'ACTIVE', categoryIds: [(await cat.json()).id],
    } })
    expect(p.status()).toBe(201)
    const productId = (await p.json()).id as string
    const created = await request.post('/v1/guest-cart')
    expect(created.status()).toBe(201)
    const guest = await created.json()
    guestIds.push(guest.guestCartId)
    expect(guest.guestToken).toMatch(/^[a-zA-Z0-9_-]{43}$/)
    const h = { 'X-Guest-Cart-Token': guest.guestToken }
    expect((await request.get('/v1/guest-cart', { headers: h })).status()).toBe(200)
    const set = () => request.put('/v1/guest-cart/items', { headers: h, data: { productId, quantity: 2 } })
    expect((await set()).status()).toBe(200)
    expect((await set()).status()).toBe(200)
    const guestQuote = await (await request.get('/v1/guest-cart/quote', { headers: h })).json()
    expect(guestQuote.items[0].quantity).toBe(2)
    const otherGuest = await (await request.post('/v1/guest-cart')).json()
    guestIds.push(otherGuest.guestCartId)
    expect((await request.delete(`/v1/guest-cart/items/${guestQuote.items[0].id}`, {
      headers: { 'X-Guest-Cart-Token': otherGuest.guestToken },
    })).status()).toBe(404)
    // Persisted customer quantity combines with guest quantity; no client-supplied price is trusted.
    expect((await request.put('/v1/cart/items', { headers: bearer(customer.token), data: { productId, quantity: 3 } })).status()).toBe(200)
    await f.db.product.update({ where: { id: productId }, data: { priceMinor: 1700 } })
    const merge = () => request.post('/v1/cart/merge', { headers: bearer(customer.token), data: { guestToken: guest.guestToken } })
    expect((await merge()).status()).toBe(200)
    const second = await merge()
    expect(second.status()).toBe(200)
    const quote = await second.json()
    expect(quote.items).toHaveLength(1)
    expect(quote.items[0].quantity).toBe(5)
    expect(quote.subtotalMinor).toBe(8500)
    expect(quote.amountDueMinor).toBeNull()
    expect((await request.get('/v1/guest-cart', { headers: h })).status()).toBe(401)
    expect((await request.post('/v1/cart/merge', { headers: bearer(other.token), data: { guestToken: guest.guestToken } })).status()).toBe(409)
    expect((await (await request.get('/v1/cart', { headers: bearer(other.token) })).json()).items).toHaveLength(0)
    const persisted = await f.db.guestCart.findUnique({ where: { id: guest.guestCartId } })
    expect(persisted?.tokenHash).not.toBe(guest.guestToken)
    expect(persisted?.mergedUserId).toBe(customer.id)
  } finally {
    await f.db.guestCart.deleteMany({ where: { id: { in: guestIds } } })
    await f.close()
  }
})

test('04A-2: overstock/mixed-currency merge rolls back atomically; capability revocation', async ({ request }) => {
  const f = new CatalogTestFixture(request)
  const guestIds: string[] = []
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const cat = await request.post('/v1/admin/categories', { headers: bearer(owner.token), data: { name: '04A2', slug: f.slug('cat') } })
    const categoryIds = [(await cat.json()).id]
    const product = await request.post('/v1/admin/products', { headers: bearer(owner.token), data: {
      title: 'Stock Guest Tee', slug: f.slug('stock'), sku: f.sku('stock'), priceMinor: 1500,
      currency: 'USD', stockOnHand: 5, status: 'ACTIVE', categoryIds,
    } })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    const create = await (await request.post('/v1/guest-cart')).json()
    guestIds.push(create.guestCartId)
    const headers = { 'X-Guest-Cart-Token': create.guestToken }
    expect((await request.put('/v1/guest-cart/items', { headers, data: { productId, quantity: 4 } })).status()).toBe(200)
    expect((await request.put('/v1/cart/items', { headers: bearer(customer.token), data: { productId, quantity: 2 } })).status()).toBe(200)
    expect((await request.post('/v1/cart/merge', { headers: bearer(customer.token), data: { guestToken: create.guestToken } })).status()).toBe(409)
    expect((await (await request.get('/v1/cart', { headers: bearer(customer.token) })).json()).items[0].quantity).toBe(2)
    expect((await (await request.get('/v1/guest-cart', { headers })).json()).items[0].quantity).toBe(4)
    // A second guest USD/EUR merge into an existing USD cart must not add any line.
    const eurProduct = await request.post('/v1/admin/products', { headers: bearer(owner.token), data: {
      title: 'EUR Tee', slug: f.slug('eur'), sku: f.sku('eur'), priceMinor: 2000,
      currency: 'EUR', stockOnHand: 10, status: 'ACTIVE', categoryIds,
    } })
    expect(eurProduct.status()).toBe(201)
    const eurGuest = await (await request.post('/v1/guest-cart')).json()
    guestIds.push(eurGuest.guestCartId)
    expect((await request.put('/v1/guest-cart/items', {
      headers: { 'X-Guest-Cart-Token': eurGuest.guestToken },
      data: { productId: (await eurProduct.json()).id, quantity: 1 },
    })).status()).toBe(200)
    expect((await request.post('/v1/cart/merge', {
      headers: bearer(customer.token), data: { guestToken: eurGuest.guestToken },
    })).status()).toBe(409)
    expect((await (await request.get('/v1/guest-cart', {
      headers: { 'X-Guest-Cart-Token': eurGuest.guestToken },
    })).json()).items).toHaveLength(1)
    await f.db.inventoryBalance.update({ where: { productId }, data: { onHand: 8 } })
    const merged = await request.post('/v1/cart/merge', { headers: bearer(customer.token), data: { guestToken: create.guestToken } })
    expect(merged.status()).toBe(200)
    expect((await merged.json()).items[0].quantity).toBe(6)
    const revoke = await (await request.post('/v1/guest-cart')).json()
    guestIds.push(revoke.guestCartId)
    const revokeHeader = { 'X-Guest-Cart-Token': revoke.guestToken }
    expect((await request.delete('/v1/guest-cart', { headers: revokeHeader })).status()).toBe(200)
    expect((await request.get('/v1/guest-cart', { headers: revokeHeader })).status()).toBe(401)
  } finally {
    await f.db.guestCart.deleteMany({ where: { id: { in: guestIds } } })
    await f.close()
  }
})
