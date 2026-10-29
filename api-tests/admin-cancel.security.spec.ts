import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04D-2B-3 admin cancellation requires JWT, Admin role, orders.manage and valid order UUID', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const customer = await f.account('CUSTOMER')
    const url = `/v1/admin/orders/${randomUUID()}/cancel`
    expect((await request.post(url)).status()).toBe(401)
    expect(
      (await request.post(url, { headers: bearer(customer.token) })).status(),
    ).toBe(403)
    expect(
      (await request.post(url, { headers: bearer(staff.token) })).status(),
    ).toBe(403)
    expect(
      (await request.post(url, { headers: bearer(owner.token) })).status(),
    ).toBe(404)
    expect(
      (
        await request.post('/v1/admin/orders/not-a-uuid/cancel', {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(400)
    // No request body is consumed; injected financial fields cannot affect the operation.
    expect(
      (
        await request.post(url, {
          headers: bearer(owner.token),
          data: { status: 'CANCELLED', refundMinor: 123 },
        })
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
