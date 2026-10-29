import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05A-1 Swagger Chromium: JWT wishlist list/add/merge Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    await openSwagger(page)
    await authorizeInSwagger(page, customer.token)
    const read = await swaggerExecute(page, 'GET', '/v1/wishlist', 200)
    expect((await read.json()).count).toBe(0)
    await swaggerExecute(
      page,
      'PUT',
      '/v1/wishlist/{productId}',
      404,
      undefined,
      { productId: randomUUID() },
    )
    const merge = await swaggerExecute(
      page,
      'POST',
      '/v1/wishlist/merge',
      200,
      { productIds: [] },
    )
    expect((await merge.json()).items).toEqual([])
  } finally {
    await f.close()
  }
})
