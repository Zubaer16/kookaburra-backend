import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test('A2 metadata/filters: invalid and unauthorized HTTP requests fail safely without data changes', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const customer = await f.account('CUSTOMER')
    const create = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: {
        name: 'Security Category',
        slug: f.slug('security'),
        color: '#AABBCC',
        sortOrder: 12,
      },
    })
    expect(create.status()).toBe(201)
    const category = await create.json()
    for (const data of [
      { color: 'url(javascript:evil)' },
      { sortOrder: -5 },
      { sortOrder: 1000001 },
      { active: 'false' },
    ]) {
      await assertSafeError(
        await request.patch(`/v1/admin/categories/${category.id}`, {
          headers: bearer(owner.token),
          data,
        }),
        400,
      )
    }
    await assertSafeError(
      await request.patch(`/v1/admin/categories/${category.id}`, {
        headers: bearer(staff.token),
        data: { active: false },
      }),
      403,
    )
    await assertSafeError(
      await request.get('/v1/admin/categories', {
        headers: bearer(customer.token),
      }),
      403,
    )
    await assertSafeError(
      await request.patch(`/v1/admin/categories/${category.id}`, {
        data: { active: false },
      }),
      401,
    )
    await assertSafeError(
      await request.get('/v1/admin/inventory?productId=not-a-uuid', {
        headers: bearer(owner.token),
      }),
      400,
    )
    await assertSafeError(
      await request.get('/v1/admin/inventory', {
        headers: bearer(customer.token),
      }),
      403,
    )
    for (const url of [
      '/v1/products?minPriceMinor=-1',
      '/v1/products?inStock=wrong',
      '/v1/products?sort=invalid',
      '/v1/products?minPriceMinor=300&maxPriceMinor=100',
      '/v1/products?tag=unknown',
      '/v1/products?maxPriceMinor=2147483648',
    ])
      await assertSafeError(await request.get(url), 400)
    const badProduct = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Invalid Tag',
        slug: f.slug('invalid-tag'),
        sku: f.sku('invalid-tag'),
        priceMinor: 1000,
        categoryIds: [category.id],
        tag: 'secret-internal',
      },
    })
    await assertSafeError(badProduct, 400)
    expect(
      await f.db.category.findUnique({
        where: { id: category.id },
        select: { active: true, color: true, sortOrder: true },
      }),
    ).toEqual({
      active: true,
      color: '#AABBCC',
      sortOrder: 12,
    })
    expect(
      await f.db.product.count({ where: { slug: f.slug('invalid-tag') } }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
