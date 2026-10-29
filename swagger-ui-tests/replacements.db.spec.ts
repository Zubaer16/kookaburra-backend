import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04D-2B-1 Swagger Chromium: replacement protected endpoints and strict action DTO', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    const id = randomUUID()
    const returnId = randomUUID()
    const replacementId = randomUUID()
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/orders/{id}/replacements/returns/{returnId}/authorize',
      400,
      { requestId: randomUUID(), stockOnHand: 99 },
      { id, returnId },
    )
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/orders/{id}/replacements/{replacementId}/ship',
      400,
      {
        requestId: randomUUID(),
        carrier: 'DHL',
        trackingNumber: 'TRACK123',
        amountMinor: 100,
      },
      { id, replacementId },
    )
    const missing = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/orders/{id}/replacements',
      404,
      undefined,
      { id },
    )
    expect(missing.status()).toBe(404)
  } finally {
    await f.close()
  }
})
