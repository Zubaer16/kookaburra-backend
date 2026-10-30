import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
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
    // Swagger validates the documented maximum before sending any request.
    // Verify that UI rejection and the server's independent validation.
    const listOperation = page.locator('.opblock.opblock-get').filter({
      has: page.locator('.opblock-summary-path', {
        hasText: /^\/v1\/admin\/customers$/,
      }),
    })
    await listOperation
      .locator('tr[data-param-name="limit"][data-param-in="query"] input')
      .fill('51')
    await listOperation.getByRole('button', { name: 'Execute', exact: true }).click()
    await expect(listOperation.locator('.validation-errors')).toContainText(
      "For 'limit': Value must be less than or equal to 50.",
    )
    expect(
      (await request.get('/v1/admin/customers', {
        headers: bearer(owner.token),
        params: { limit: 51 },
      })).status(),
    ).toBe(400)
  } finally {
    await f.close()
  }
})
