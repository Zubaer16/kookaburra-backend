import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04D-2B-2 Swagger Chromium: tracking permission-scoped Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    const id = randomUUID()
    const missing = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/orders/{id}/tracking',
      404,
      undefined,
      { id },
    )
    expect(missing.status()).toBe(404)
    // Owner JWT is not a CUSTOMER JWT; Swagger must enforce role guard.
    const denied = await swaggerExecute(
      page,
      'GET',
      '/v1/orders/{id}/tracking',
      403,
      undefined,
      { id },
    )
    expect(denied.status()).toBe(403)
  } finally {
    await f.close()
  }
})
