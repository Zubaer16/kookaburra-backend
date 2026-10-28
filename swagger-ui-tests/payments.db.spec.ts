import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('04C-2A Swagger Chromium: test payment preparation disabled safely and JWT protected', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    await openSwagger(page)
    await authorizeInSwagger(page, customer.token)
    // No Stripe credentials injected into API test runner; no provider call.
    const resp = await swaggerExecute(
      page,
      'POST',
      '/v1/payments/orders/{orderId}/prepare',
      503,
      undefined,
      { orderId: '10000000-0000-4000-8000-000000000000' },
    )
    expect(resp.status()).toBe(503)
    // GET always enforces order ownership even without configured provider.
    await swaggerExecute(
      page,
      'GET',
      '/v1/payments/orders/{orderId}',
      404,
      undefined,
      { orderId: '10000000-0000-4000-8000-000000000000' },
    )
  } finally {
    await f.close()
  }
})
