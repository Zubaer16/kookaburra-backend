import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('A2 UI contract: real PostgreSQL category navigation, merchandise, filters, money and inventory lookup', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const headers = bearer(owner.token)
    const categoryCreate = await request.post('/v1/admin/categories', {
      headers,
      data: {
        name: 'A2 Navigation',
        slug: f.slug('navigation'),
        color: '#FAE0FF',
        sortOrder: 7,
        active: false,
      },
    })
    expect(categoryCreate.status()).toBe(201)
    const category = await categoryCreate.json()
    expect(category).toMatchObject({
      color: '#FAE0FF',
      sortOrder: 7,
      active: false,
    })
    const hidden = await request.get('/v1/categories')
    expect(hidden.status()).toBe(200)
    expect(
      (await hidden.json()).some((c: { id: string }) => c.id === category.id),
    ).toBe(false)
    const adminCategories = await request.get('/v1/admin/categories', {
      headers,
    })
    expect(
      (await adminCategories.json()).some(
        (c: { id: string }) => c.id === category.id,
      ),
    ).toBe(true)
    expect(
      (
        await request.patch(`/v1/admin/categories/${category.id}`, {
          headers,
          data: { active: true, sortOrder: 1 },
        })
      ).status(),
    ).toBe(200)
    const visible = await request.get('/v1/categories')
    expect(
      (await visible.json()).some((c: { id: string }) => c.id === category.id),
    ).toBe(true)
    const slug = f.slug('shirt')
    const productResponse = await request.post('/v1/admin/products', {
      headers,
      data: {
        title: 'A2 Shirt',
        slug,
        sku: f.sku('shirt'),
        status: 'ACTIVE',
        categoryIds: [category.id],
        priceMinor: 2500,
        compareAtMinor: 3000,
        badge: 'Staff Pick',
        tag: 'popular',
        variants: [
          {
            sku: f.sku('size-m'),
            options: { size: 'M' },
            stockOnHand: 3,
            priceMinor: 2700,
          },
        ],
      },
    })
    expect(productResponse.status()).toBe(201)
    const created = await productResponse.json()
    const productResponse2 = await request.get(`/v1/products/${slug}`)
    expect(productResponse2.status()).toBe(200)
    const product = await productResponse2.json()
    expect(product).toMatchObject({
      id: created.id,
      badge: 'Staff Pick',
      tag: 'popular',
      categoryIds: [category.id],
      price: { amountMinor: 2500, currency: 'USD' },
      compareAt: { amountMinor: 3000, currency: 'USD' },
      purchasable: true,
    })
    expect(product.variants[0]).toMatchObject({
      available: true,
      price: { amountMinor: 2700, currency: 'USD' },
    })
    const list = await request.get('/v1/products', {
      params: {
        category: category.slug,
        tag: 'popular',
        inStock: 'true',
        sort: 'price-asc',
        minPriceMinor: 2400,
        maxPriceMinor: 2600,
        page: 1,
        limit: 5,
      },
    })
    expect(list.status()).toBe(200)
    const page = await list.json()
    expect(page.pageSize).toBe(5)
    expect(page.items.some((p: { id: string }) => p.id === created.id)).toBe(
      true,
    )
    const outOfStock = await request.get('/v1/products', {
      params: {
        category: category.slug,
        inStock: 'false',
      },
    })
    expect(
      (await outOfStock.json()).items.some(
        (p: { id: string }) => p.id === created.id,
      ),
    ).toBe(false)
    const noMatch = await request.get('/v1/products', {
      params: { tag: 'sale', category: category.slug },
    })
    expect(
      (await noMatch.json()).items.some(
        (p: { id: string }) => p.id === created.id,
      ),
    ).toBe(false)
    const balanceList = await request.get('/v1/admin/inventory', {
      headers,
      params: {
        productId: created.id,
        variantId: product.variants[0].id,
      },
    })
    expect(balanceList.status()).toBe(200)
    const balance = await balanceList.json()
    expect(balance.pageSize).toBe(20)
    expect(balance.items).toHaveLength(1)
    expect(balance.items[0]).toMatchObject({
      productId: created.id,
      variantId: product.variants[0].id,
      onHand: 3,
    })
    expect(
      await f.db.product.count({ where: { id: created.id, tag: 'popular' } }),
    ).toBe(1)
    const badRange = await request.get(
      '/v1/products?minPriceMinor=5000&maxPriceMinor=1000',
    )
    expect(badRange.status()).toBe(400)
    const invalidVariantId = randomUUID()
    const empty = await request.get('/v1/admin/inventory', {
      headers,
      params: { variantId: invalidVariantId },
    })
    expect((await empty.json()).items).toHaveLength(0)
  } finally {
    await f.close()
  }
})
