import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04D-2A Swagger Chromium: returns access and strict DTO validation', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    await openSwagger(page)
    await authorizeInSwagger(page, customer.token)
    const id = randomUUID()
    const invalid = await swaggerExecute(
      page,
      'POST',
      '/v1/orders/{id}/returns',
      400,
      {
        requestId: randomUUID(),
        orderLineId: randomUUID(),
        quantity: 1,
        reason: 'OTHER',
        stockOnHand: 100,
      },
      { id },
    )
    expect(invalid.status()).toBe(400)
    await swaggerExecute(
      page,
      'GET',
      '/v1/orders/{id}/returns',
      404,
      undefined,
      { id },
    )
  } finally {
    await f.close()
  }
})
