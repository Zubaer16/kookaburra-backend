import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04B-1 isolated DB: configured country estimate, threshold, live repricing, no reservations', async ({ request }) => {
  const f = new CatalogTestFixture(request)
  const countryCode = 'CK'
  const currency = 'USD'
  let originalRate: Awaited<ReturnType<typeof f.db.checkoutRate.findUnique>> | null = null
  try {
    originalRate = await f.db.checkoutRate.findUnique({ where: { countryCode_currency: { countryCode, currency } } })
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const ownerAuth = bearer(owner.token)
    const auth = bearer(customer.token)
    const category = await request.post('/v1/admin/categories', {
      headers: ownerAuth, data: { name: 'Quote Test', slug: f.slug('category') },
    })
    expect(category.status()).toBe(201)
    const created = await request.post('/v1/admin/products', {
      headers: ownerAuth, data: {
        title: 'Quote Test Product', slug: f.slug('item'), sku: f.sku('item'),
        priceMinor: 1299, currency, stockOnHand: 5, status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(created.status()).toBe(201)
    const productId = (await created.json()).id as string
    const putCart = await request.put('/v1/cart/items', {
      headers: auth, data: { productId, quantity: 2 },
    })
    expect(putCart.status()).toBe(200)
    const quote = () => request.post('/v1/checkout/estimate', { headers: auth, data: { countryCode } })
    // Unconfigured lanes fail closed; no hidden default rate or implicit free shipping.
    await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    expect((await quote()).status()).toBe(422)
    const putRate = (shippingMinor: number, freeOverSubtotalMinor: number | null, enabled = true) =>
      request.put('/v1/admin/checkout/rates', {
        headers: ownerAuth, data: { countryCode, currency, shippingMinor, freeOverSubtotalMinor, taxBps: 750, enabled },
      })
    expect((await putRate(400, 3000)).status()).toBe(200)
    expect(await f.db.auditEvent.count({ where: { actorId: owner.id, action: 'checkout.rate.upserted' } })).toBeGreaterThan(0)
    let result = await quote()
    expect(result.status()).toBe(200)
    let data = await result.json()
    expect(data).toMatchObject({
      countryCode, currency, subtotalMinor: 2598, shippingMinor: 400, taxMinor: 195,
      estimatedTotalMinor: 3193, reservationStatus: 'NOT_RESERVED', payable: false,
    })
    expect((await f.db.inventoryBalance.findUniqueOrThrow({ where: { productId } })).onHand).toBe(5)
    expect((await f.db.inventoryMovement.count({ where: { balance: { productId } } }))).toBe(1)
    // Live prices override any previous estimate; free shipping threshold is inclusive.
    await f.db.product.update({ where: { id: productId }, data: { priceMinor: 1500 } })
    result = await quote()
    expect(result.status()).toBe(200)
    data = await result.json()
    expect(data).toMatchObject({ subtotalMinor: 3000, shippingMinor: 0, taxMinor: 225, estimatedTotalMinor: 3225 })
    expect((await putRate(400, 5000, false)).status()).toBe(200)
    expect((await quote()).status()).toBe(422)
    expect((await putRate(400, 5000)).status()).toBe(200)
    await f.db.inventoryBalance.update({ where: { productId }, data: { onHand: 1 } })
    expect((await quote()).status()).toBe(409)
    // No public customer can configure a rate or supply totals in quote input.
    expect((await request.put('/v1/admin/checkout/rates', { headers: auth, data: { countryCode } })).status()).toBe(403)
  } finally {
    if (originalRate) {
      await f.db.checkoutRate.upsert({
        where: { countryCode_currency: { countryCode, currency } },
        create: {
          countryCode, currency,
          shippingMinor: originalRate.shippingMinor,
          freeOverSubtotalMinor: originalRate.freeOverSubtotalMinor,
          taxBps: originalRate.taxBps,
          enabled: originalRate.enabled,
        },
        update: {
          shippingMinor: originalRate.shippingMinor,
          freeOverSubtotalMinor: originalRate.freeOverSubtotalMinor,
          taxBps: originalRate.taxBps,
          enabled: originalRate.enabled,
        },
      })
    } else {
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    }
    await f.close()
  }
})
