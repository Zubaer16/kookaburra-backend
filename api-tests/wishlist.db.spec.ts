import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('05A-1 real DB: independent customer persistence, duplicate-safe merge, unpublished hiding', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const adminAuth = bearer(owner.token)
    const customerAuth = bearer(customer.token)
    const otherAuth = bearer(other.token)
    const category = await request.post('/v1/admin/categories', {
      headers: adminAuth,
      data: { name: 'Wishlist test', slug: f.slug('wishlist') },
    })
    expect(category.status()).toBe(201)
    const ids: string[] = []
    for (const suffix of ['a', 'b']) {
      const created = await request.post('/v1/admin/products', {
        headers: adminAuth,
        data: {
          title: `05A Wishlist Product ${suffix}`,
          slug: f.slug(`wishlist-${suffix}`),
          sku: f.sku(`wishlist-${suffix}`),
          priceMinor: 1300,
          currency: 'USD',
          stockOnHand: 3,
          status: 'ACTIVE',
          categoryIds: [(await category.json()).id],
        },
      })
      expect(created.status()).toBe(201)
      ids.push((await created.json()).id)
    }
    const initial = await request.get('/v1/wishlist', { headers: customerAuth })
    expect(initial.status()).toBe(200)
    expect((await initial.json()).count).toBe(0)

    const first = await request.put(`/v1/wishlist/${ids[0]}`, {
      headers: customerAuth,
    })
    expect(first.status()).toBe(200)
    expect((await first.json()).count).toBe(1)
    const simultaneous = await Promise.all([
      request.post('/v1/wishlist/merge', {
        headers: customerAuth,
        data: { productIds: ids },
      }),
      request.post('/v1/wishlist/merge', {
        headers: customerAuth,
        data: { productIds: ids },
      }),
    ])
    expect(simultaneous.every((r) => r.status() === 200)).toBe(true)
    const persisted = await (
      await request.get('/v1/wishlist', { headers: customerAuth })
    ).json()
    expect(persisted.count).toBe(2)
    expect(
      new Set(persisted.items.map((i: { productId: string }) => i.productId))
        .size,
    ).toBe(2)
    expect(persisted.items[0]).toMatchObject({
      currency: 'USD',
      priceMinor: 1300,
    })
    expect(
      (await (await request.get('/v1/wishlist', { headers: otherAuth })).json())
        .count,
    ).toBe(0)
    expect(
      (
        await (
          await request.delete(`/v1/wishlist/${ids[0]}`, { headers: otherAuth })
        ).json()
      ).removed,
    ).toBe(false)
    expect(
      (
        await (
          await request.get('/v1/wishlist', { headers: customerAuth })
        ).json()
      ).count,
    ).toBe(2)

    const archive = await request.patch(`/v1/admin/products/${ids[1]}`, {
      headers: adminAuth,
      data: { status: 'ARCHIVED' },
    })
    expect(archive.status()).toBe(200)
    const hidden = await (
      await request.get('/v1/wishlist', { headers: customerAuth })
    ).json()
    expect(hidden.count).toBe(1)
    expect(hidden.items[0].productId).toBe(ids[0])
    const badAdd = await request.put(`/v1/wishlist/${ids[1]}`, {
      headers: customerAuth,
    })
    expect(badAdd.status()).toBe(404)
    const mixedMerge = await request.post('/v1/wishlist/merge', {
      headers: customerAuth,
      data: { productIds: [ids[0], ids[1]] },
    })
    expect(mixedMerge.status()).toBe(404)
    expect(
      (
        await (
          await request.get('/v1/wishlist', { headers: customerAuth })
        ).json()
      ).count,
    ).toBe(1)
    expect(
      (
        await (
          await request.delete(`/v1/wishlist/${ids[0]}`, {
            headers: customerAuth,
          })
        ).json()
      ).removed,
    ).toBe(true)
    expect(
      (
        await (
          await request.delete(`/v1/wishlist/${ids[0]}`, {
            headers: customerAuth,
          })
        ).json()
      ).removed,
    ).toBe(false)
    expect(
      (
        await (
          await request.get('/v1/wishlist', { headers: customerAuth })
        ).json()
      ).count,
    ).toBe(0)
  } finally {
    await f.close()
  }
})

test('05A-1 real DB: 100-item limit is transactional and does not partially merge', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const auth = bearer(customer.token)
    await f.db.product.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        slug: f.slug(`bulk-wishlist-${i}`),
        title: `Wishlist limit product ${i}`,
        currency: 'USD',
        priceMinor: 150,
        status: 'ACTIVE' as const,
      })),
    })
    const products = await f.db.product.findMany({
      where: { slug: { startsWith: f.slug('bulk-wishlist-') } },
      orderBy: { slug: 'asc' },
      select: { id: true },
    })
    expect(products).toHaveLength(101)
    const first100 = products.slice(0, 100).map((p) => p.id)
    expect(
      (
        await request.post('/v1/wishlist/merge', {
          headers: auth,
          data: { productIds: first100 },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.put(`/v1/wishlist/${products[100]!.id}`, {
          headers: auth,
        })
      ).status(),
    ).toBe(409)
    const response = await request.get('/v1/wishlist', { headers: auth })
    expect(response.status()).toBe(200)
    expect((await response.json()).count).toBe(100)
    const again = await request.post('/v1/wishlist/merge', {
      headers: auth,
      data: { productIds: first100 },
    })
    expect(again.status()).toBe(200)
    expect((await again.json()).count).toBe(100)
  } finally {
    await f.close()
  }
})
