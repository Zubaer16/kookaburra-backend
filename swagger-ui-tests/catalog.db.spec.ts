import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

/** True Chromium Swagger UI automation (not just APIRequestContext).
 * Each request uses Try it out -> Execute and verifies Swagger's live status.
 * An isolated random namespace is cleaned up even after assertion failures.
 */
test('Phase 03A Catalog: execute every new endpoint via actual Swagger UI', async ({
  page,
  request,
}) => {
  test.setTimeout(360_000)
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/categories', 200)
    await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      200,
      undefined,
      {},
      { page: 1, limit: 5 },
    )
    await swaggerExecute(page, 'GET', '/v1/admin/categories', 401)
    await authorizeInSwagger(page, owner.token)

    await swaggerExecute(page, 'GET', '/v1/admin/categories', 200)
    const createdCategory = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/categories',
      201,
      {
        name: 'QA Catalog',
        slug: f.slug('category'),
      },
    )
    const category = (await createdCategory.json()) as { id: string }
    const updatedCategory = await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/categories/{id}',
      200,
      { description: 'Visual QA category' },
      { id: category.id },
    )
    expect((await updatedCategory.json()).description).toBe(
      'Visual QA category',
    )

    const unused = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/categories',
      201,
      { name: 'Unused', slug: f.slug('unused') },
    )
    const unusedId = ((await unused.json()) as { id: string }).id
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/categories/{id}',
      200,
      undefined,
      { id: unusedId },
    )

    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/products',
      200,
      undefined,
      {},
      { page: 1, limit: 5 },
    )
    const productCreated = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/products',
      201,
      {
        title: 'QA Product',
        slug: f.slug('product'),
        sku: f.sku('product'),
        status: 'DRAFT',
        priceMinor: 1200,
        categoryIds: [category.id],
      },
    )
    const productId = ((await productCreated.json()) as { id: string }).id
    const adminProduct = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/products/{id}',
      200,
      undefined,
      { id: productId },
    )
    expect((await adminProduct.json()).id).toBe(productId)

    const variant = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/products/{id}/variants',
      201,
      { sku: f.sku('blue'), options: { color: 'Blue' }, stockOnHand: 0 },
      { id: productId },
    )
    const variantId = ((await variant.json()) as { id: string }).id
    const updatedVariant = await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/products/{id}/variants/{variantId}',
      200,
      { options: { color: 'Green' } },
      { id: productId, variantId },
    )
    expect((await updatedVariant.json()).options).toMatchObject({
      color: 'Green',
    })
    const removed = await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/products/{id}/variants/{variantId}',
      200,
      undefined,
      { id: productId, variantId },
    )
    expect((await removed.json()).deleted).toBe(true)

    const published = await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/products/{id}',
      200,
      { status: 'ACTIVE', title: 'Published QA Product' },
      { id: productId },
    )
    expect((await published.json()).status).toBe('ACTIVE')
    const publicDetail = await swaggerExecute(
      page,
      'GET',
      '/v1/products/{slug}',
      200,
      undefined,
      { slug: f.slug('product') },
    )
    expect((await publicDetail.json()).id).toBe(productId)
    const publicList = await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      200,
      undefined,
      {},
      { category: f.slug('category'), page: 1, limit: 10 },
    )
    expect((await publicList.json()).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: productId })]),
    )

    const archived = await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/products/{id}',
      200,
      undefined,
      { id: productId },
    )
    expect((await archived.json()).status).toBe('ARCHIVED')
    await swaggerExecute(page, 'GET', '/v1/products/{slug}', 404, undefined, {
      slug: f.slug('product'),
    })
    expect(
      (await f.db.product.findUnique({ where: { id: productId } }))?.status,
    ).toBe('ARCHIVED')
  } finally {
    await f.close()
  }
})

test('Phase 03A Catalog: Swagger UI rejects invalid, duplicate, missing-token and forbidden changes', async ({
  page,
  request,
}) => {
  test.setTimeout(360_000)
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const customer = await f.account('CUSTOMER')
    await openSwagger(page)
    await swaggerExecute(page, 'POST', '/v1/admin/categories', 401, {
      name: 'No token',
      slug: f.slug('denied'),
    })
    await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      400,
      undefined,
      {},
      { page: 0, limit: 101 },
    )
    await authorizeInSwagger(page, 'invalid.jwt.token')
    await swaggerExecute(page, 'GET', '/v1/admin/products', 401)
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    await swaggerExecute(page, 'POST', '/v1/admin/categories', 400, {
      name: '',
      slug: f.slug('empty'),
    })
    const created = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/categories',
      201,
      { name: 'Protected category', slug: f.slug('category') },
    )
    const categoryId = ((await created.json()) as { id: string }).id
    const base = {
      title: 'QA Test Product',
      slug: f.slug('product'),
      sku: f.sku('product'),
      priceMinor: 1000,
      categoryIds: [categoryId],
    }
    for (const [label, data] of [
      ['negative price', { ...base, priceMinor: -1 }],
      ['fractional price', { ...base, priceMinor: 10.5 }],
      ['mass assignment', { ...base, isSuperAdmin: true }],
      ['oversized title', { ...base, title: 'X'.repeat(251) }],
      ['invalid SKU symbols', { ...base, sku: 'INVALID@SKU' }],
      ['int32 overflow', { ...base, priceMinor: 2147483648 }],
      ['invalid category', { ...base, categoryIds: ['not-a-uuid'] }],
      ['compare price below selling price', { ...base, compareAtMinor: 500 }],
    ] as const) {
      await test.step(label, async () => {
        await swaggerExecute(page, 'POST', '/v1/admin/products', 400, data)
      })
    }
    expect(await f.db.product.count({ where: { slug: base.slug } })).toBe(0)
    const accepted = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/products',
      201,
      base,
    )
    const productId = ((await accepted.json()) as { id: string }).id
    await swaggerExecute(page, 'POST', '/v1/admin/products', 409, {
      ...base,
      slug: f.slug('another'),
    })
    expect(await f.db.product.count({ where: { sku: base.sku } })).toBe(1)

    // Reset Swagger authorization between roles (persistAuthorization: false).
    await openSwagger(page)
    await authorizeInSwagger(page, staff.token)
    await swaggerExecute(page, 'GET', '/v1/admin/products', 200)
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/products/{id}',
      403,
      { title: 'Unauthorized edit' },
      { id: productId },
    )
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/products/{id}',
      403,
      undefined,
      { id: productId },
    )
    expect(
      (await f.db.product.findUnique({ where: { id: productId } }))?.title,
    ).toBe(base.title)

    await openSwagger(page)
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(page, 'GET', '/v1/admin/categories', 403)
    await swaggerExecute(page, 'POST', '/v1/admin/categories', 403, {
      name: 'Customer cannot write',
      slug: f.slug('customer-denied'),
    })
    expect(
      await f.db.category.count({ where: { slug: f.slug('customer-denied') } }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
