import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
const uuid = '10000000-0000-4000-8000-000000000000'
test('04C-2B2B test completion disabled, JWT protected, owner forbidden', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const owner = await f.account('OWNER')
    expect(
      (
        await request.post(`/v1/payments/orders/${uuid}/test-complete`)
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post(`/v1/payments/orders/${uuid}/test-complete`, {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(`/v1/payments/orders/${uuid}/test-complete`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(503)
  } finally {
    await f.close()
  }
})
