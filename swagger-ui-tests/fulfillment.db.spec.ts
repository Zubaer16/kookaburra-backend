import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04D-1 Swagger Chromium: orders admin paid-only fulfillment guard', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const id = randomUUID()
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    const response = await swaggerExecute(
      page,
      'POST',
      '/v1/admin/orders/{id}/fulfillment/start',
      404,
      { requestId: randomUUID() },
      { id },
    )
    expect(response.status()).toBe(404)
    await swaggerExecute(page, 'GET', '/v1/admin/orders/{id}', 404, undefined, {
      id,
    })
  } finally {
    await f.close()
  }
})
