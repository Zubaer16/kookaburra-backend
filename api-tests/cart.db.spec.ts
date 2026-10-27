import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04A real DB: customer cart persistence, idempotent quantities, live prices/stock and private ownership', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const secondCustomer = bearer(other.token)
    const auth = bearer(customer.token)
    const initial = await request.get('/v1/cart', { headers: auth })
    expect(initial.status()).toBe(200)
    expect((await initial.json()).checkoutReady).toBe(false)
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: '04A', slug: f.slug('category') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: '04A Customer Tee',
        slug: f.slug('tee'),
        sku: f.sku('tee'),
        priceMinor: 1299,
        currency: 'USD',
        stockOnHand: 7,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const item = await product.json()
    const put = () =>
      request.put('/v1/cart/items', {
        headers: auth,
        data: { productId: item.id, quantity: 3 },
      })
    expect((await put()).status()).toBe(200)
    // Concurrent absolute sets for the same SKU must never insert duplicate lines.
    const concurrent = await Promise.all([put(), put()])
    expect(concurrent.every((r) => r.status() === 200)).toBe(true)
    const again = await put()
    expect(again.status()).toBe(200)
    const quoted = await again.json()
    expect(quoted.checkoutReady).toBe(true)
    expect(quoted.items).toHaveLength(1)
    expect(quoted.items[0].quantity).toBe(3)
    expect(quoted.subtotalMinor).toBe(3897)
    expect(quoted.amountDueMinor).toBeNull()
    expect(
      (
        await (
          await request.get('/v1/cart/quote', { headers: secondCustomer })
        ).json()
      ).items,
    ).toHaveLength(0)
    const foreignRemoval = await request.delete(
      `/v1/cart/items/${quoted.items[0].id}`,
      { headers: secondCustomer },
    )
    expect(foreignRemoval.status()).toBe(404)

    // Price changes never trust previously quoted/client-supplied numbers.
    await f.db.product.update({
      where: { id: item.id },
      data: { priceMinor: 1400 },
    })
    const reprice = await (
      await request.get('/v1/cart/quote', { headers: auth })
    ).json()
    expect(reprice.subtotalMinor).toBe(4200)
    // Inventory balance is authoritative even when the product mirror lags.
    await f.db.inventoryBalance.update({
      where: { productId: item.id },
      data: { onHand: 2 },
    })
    const changedStock = await (
      await request.get('/v1/cart', { headers: auth })
    ).json()
    expect(changedStock.checkoutReady).toBe(false)
    expect(changedStock.items[0].status).toBe('OUT_OF_STOCK')
    const blocked = await request.put('/v1/cart/items', {
      headers: auth,
      data: { productId: item.id, quantity: 6 },
    })
    expect(blocked.status()).toBe(409)
    await f.db.inventoryBalance.update({
      where: { productId: item.id },
      data: { onHand: 7 },
    })
    const archive = await request.patch(`/v1/admin/products/${item.id}`, {
      headers: bearer(owner.token),
      data: { status: 'ARCHIVED' },
    })
    expect(archive.status()).toBe(200)
    const hidden = await (
      await request.get('/v1/cart/quote', { headers: auth })
    ).json()
    expect(hidden.items[0].status).toBe('UNPUBLISHED')
    const removal = await request.delete(
      `/v1/cart/items/${quoted.items[0].id}`,
      { headers: auth },
    )
    expect(removal.status()).toBe(200)
    expect((await removal.json()).items).toHaveLength(0)
    expect((await request.delete('/v1/cart', { headers: auth })).status()).toBe(
      200,
    )
  } finally {
    await f.close()
  }
})

test('04A real DB: variant-specific pricing and stock, wrong variants and simple-product rules', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const auth = bearer(customer.token)
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: '04A Variant', slug: f.slug('variant-category') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: '04A Variant',
        slug: f.slug('variant'),
        sku: f.sku('variant'),
        priceMinor: 2000,
        currency: 'USD',
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
        variants: [
          {
            sku: f.sku('v1'),
            options: { size: 'M' },
            priceMinor: 2200,
            stockOnHand: 2,
          },
        ],
      },
    })
    expect(product.status()).toBe(201)
    const p = await product.json()
    const base = { productId: p.id, quantity: 2 }
    expect(
      (
        await request.put('/v1/cart/items', { headers: auth, data: base })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: auth,
          data: { ...base, variantId: '11111111-1111-4111-8111-111111111111' },
        })
      ).status(),
    ).toBe(400)
    const accepted = await request.put('/v1/cart/items', {
      headers: auth,
      data: { ...base, variantId: p.variants[0].id },
    })
    expect(accepted.status()).toBe(200)
    expect((await accepted.json()).subtotalMinor).toBe(4400)
    const tooMany = await request.put('/v1/cart/items', {
      headers: auth,
      data: { ...base, quantity: 3, variantId: p.variants[0].id },
    })
    expect(tooMany.status()).toBe(409)
  } finally {
    await f.close()
  }
})
