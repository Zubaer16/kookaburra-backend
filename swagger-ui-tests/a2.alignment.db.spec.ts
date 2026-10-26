import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  CatalogTestFixture,
  assertSafeError,
  bearer,
} from '../api-tests/catalog-test-support'
import {
  openSwagger,
  authorizeInSwagger,
  swaggerExecute,
} from './swagger-helper'

test('A2 Swagger UI real Chromium: metadata, filters, inventory lookup and rejected writes', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000)
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/categories', 401)
    await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      400,
      undefined,
      {},
      // Both values satisfy their individual Swagger minimum constraints,
      // but their inverted range violates the backend's business rule.
      // A negative number can be blocked by Swagger's number input before
      // any HTTP request is issued, causing waitForResponse to time out.
      { minPriceMinor: 3000, maxPriceMinor: 1000 },
    )
    await authorizeInSwagger(page, owner.token)
    const created = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/categories',
      201,
      {
        name: 'A2 Visual',
        slug: f.slug('visual'),
        color: '#1122AA',
        sortOrder: 9,
        active: true,
      },
    )
    const category = await created.json()
    expect(category.color).toBe('#1122AA')
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/categories/{id}',
      400,
      { color: 'invalid-color' },
      { id: category.id },
    )
    expect(
      (await f.db.category.findUnique({ where: { id: category.id } }))?.color,
    ).toBe('#1122AA')
    const productCreated = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/products',
      201,
      {
        title: 'A2 Visual Shirt',
        slug: f.slug('visual-shirt'),
        sku: f.sku('visual-shirt'),
        priceMinor: 2000,
        status: 'ACTIVE',
        tag: 'new',
        badge: 'Just in',
        stockOnHand: 1,
        categoryIds: [category.id],
      },
    )
    const product = await productCreated.json()
    const list = await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      200,
      undefined,
      {},
      {
        category: category.slug,
        tag: 'new',
        sort: 'price-asc',
        inStock: 'true',
        minPriceMinor: 1000,
        maxPriceMinor: 3000,
        page: 1,
        limit: 10,
      },
    )
    expect(
      (await list.json()).items.some(
        (item: { id: string }) => item.id === product.id,
      ),
    ).toBe(true)
    const balances = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/inventory',
      200,
      undefined,
      {},
      {
        productId: product.id,
      },
    )
    expect(
      (await balances.json()).items.some(
        (item: { productId: string }) => item.productId === product.id,
      ),
    ).toBe(true)
    // Swagger validates UUID-formatted query inputs before submission. Test
    // its real-browser path with a syntactically valid, nonexistent UUID.
    const missingProductId = randomUUID()
    const missingBalances = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/inventory',
      200,
      undefined,
      {},
      { productId: missingProductId },
    )
    expect((await missingBalances.json()).items).toHaveLength(0)

    // Malformed UUIDs must still be rejected by the server. Swagger may
    // prevent executing such a form; use real HTTP on the same isolated DB.
    await assertSafeError(
      await request.get('/v1/admin/inventory', {
        headers: bearer(owner.token),
        params: { productId: 'invalid-uuid' },
      }),
      400,
    )
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/products/{id}',
      400,
      { tag: 'restricted' },
      { id: product.id },
    )
    expect(
      (await f.db.product.findUnique({ where: { id: product.id } }))?.tag,
    ).toBe('new')
  } finally {
    await f.close()
  }
})
