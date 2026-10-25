import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('Phase 03B Swagger Chromium: Inventory CRUD, real DB, invalid data and RBAC through Try it out → Execute', async ({
  page,
  request,
}) => {
  test.setTimeout(360_000)
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const id = randomUUID()
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/inventory', 401)
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/inventory/{id}/adjustments',
      401,
      { requestId: randomUUID(), delta: 1, reason: 'RECEIPT' },
      { id },
    )
    await authorizeInSwagger(page, customer.token)
    await swaggerExecute(page, 'GET', '/v1/admin/inventory', 403)
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)

    const cat = await request.post('/v1/admin/categories', {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: {
        name: 'Swagger Inventory',
        slug: f.slug('cat'),
      },
    })
    expect(cat.status()).toBe(201)
    const categoryId = (await cat.json()).id as string
    const p = await request.post('/v1/admin/products', {
      headers: { Authorization: `Bearer ${owner.token}` },
      data: {
        title: 'Swagger inventory',
        slug: f.slug('product'),
        sku: f.sku('p'),
        stockOnHand: 4,
        priceMinor: 100,
        categoryIds: [categoryId],
      },
    })
    expect(p.status()).toBe(201)
    const productId = (await p.json()).id as string
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    const items = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/inventory',
      200,
      undefined,
      {},
      { page: 1, limit: 20, lowStock: 'true' },
    )
    expect((await items.json()).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: balance.id })]),
    )
    const get = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/inventory/{id}',
      200,
      undefined,
      { id: balance.id },
    )
    expect((await get.json()).onHand).toBe(4)
    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/inventory/{id}',
      400,
      undefined,
      { id: 'not-uuid' },
    )
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/inventory/{id}/threshold',
      400,
      { lowStockThreshold: -1 },
      { id: balance.id },
    )
    const threshold = await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/inventory/{id}/threshold',
      200,
      { lowStockThreshold: 1 },
      { id: balance.id },
    )
    expect((await threshold.json()).lowStockThreshold).toBe(1)
    const endpoint = '/v1/admin/inventory/{id}/adjustments'
    for (const invalid of [
      { requestId: randomUUID(), delta: 0, reason: 'RECEIPT' },
      { requestId: randomUUID(), delta: 0.5, reason: 'RECEIPT' },
      { requestId: randomUUID(), delta: -2, reason: 'RECEIPT' },
      { requestId: randomUUID(), delta: 1, reason: 'OPENING' },
      { requestId: randomUUID(), delta: 1, reason: 'RECEIPT', isOwner: true },
    ])
      await swaggerExecute(page, 'POST', endpoint, 400, invalid, {
        id: balance.id,
      })
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(4)
    const key = randomUUID()
    const payload = {
      requestId: key,
      delta: 3,
      reason: 'RECEIPT',
      note: 'visual test',
    }
    const accepted = await swaggerExecute(
      page,
      'POST',
      endpoint,
      201,
      payload,
      { id: balance.id },
    )
    expect((await accepted.json()).inventory.onHand).toBe(7)
    const replay = await swaggerExecute(page, 'POST', endpoint, 201, payload, {
      id: balance.id,
    })
    expect((await replay.json()).replayed).toBe(true)
    await swaggerExecute(
      page,
      'POST',
      endpoint,
      409,
      { ...payload, delta: 2 },
      { id: balance.id },
    )
    await swaggerExecute(
      page,
      'POST',
      endpoint,
      409,
      { requestId: randomUUID(), delta: -8, reason: 'CORRECTION' },
      { id: balance.id },
    )
    const movements = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/inventory/{id}/movements',
      200,
      undefined,
      { id: balance.id },
      { page: 1, limit: 20 },
    )
    expect((await movements.json()).total).toBe(2)
    expect(
      (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockOnHand,
    ).toBe(7)
    await openSwagger(page)
    await authorizeInSwagger(page, staff.token)
    await swaggerExecute(page, 'GET', '/v1/admin/inventory', 200)
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/inventory/{id}/threshold',
      403,
      { lowStockThreshold: 100 },
      { id: balance.id },
    )
    await swaggerExecute(
      page,
      'POST',
      endpoint,
      403,
      { requestId: randomUUID(), delta: 5, reason: 'RECEIPT' },
      { id: balance.id },
    )
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(7)
  } finally {
    await f.close()
  }
})
