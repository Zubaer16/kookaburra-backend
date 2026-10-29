import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04D-2B-3 Swagger Chromium: Admin unpaid cancellation permission-scoped Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    const missing = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/orders/{id}/cancel',
      404,
      undefined,
      { id: randomUUID() },
    )
    expect(missing.status()).toBe(404)
    await authorizeInSwagger(page, customer.token)
    const blocked = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/orders/{id}/cancel',
      403,
      undefined,
      { id: randomUUID() },
    )
    expect(blocked.status()).toBe(403)
  } finally {
    await f.close()
  }
})
