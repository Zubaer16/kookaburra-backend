import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05A-3 Swagger Chromium: admin customer directory Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/customers', 401)
    await authorizeInSwagger(page, owner.token)
    const list = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/customers',
      200,
      undefined,
      {},
      { page: 1, limit: 5, search: customer.email },
    )
    expect((await list.json()).items[0].id).toBe(customer.id)
    const detail = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/customers/{id}',
      200,
      undefined,
      { id: customer.id },
    )
    expect((await detail.json()).id).toBe(customer.id)
    await swaggerExecute(
      page,
      'GET',
      '/v1/admin/customers',
      400,
      undefined,
      {},
      { limit: 51 },
    )
  } finally {
    await f.close()
  }
})
