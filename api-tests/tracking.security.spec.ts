import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04D-2B-2 tracking: JWT, customer role, UUID and staff RBAC', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const id = randomUUID()
    const userUrl = `/v1/orders/${id}/tracking`
    const adminUrl = `/v1/admin/orders/${id}/tracking`
    expect((await request.get(userUrl)).status()).toBe(401)
    expect((await request.get(adminUrl)).status()).toBe(401)
    expect(
      (await request.get(userUrl, { headers: bearer(owner.token) })).status(),
    ).toBe(403)
    expect(
      (
        await request.get(adminUrl, { headers: bearer(customer.token) })
      ).status(),
    ).toBe(403)
    expect(
      (await request.get(adminUrl, { headers: bearer(other.token) })).status(),
    ).toBe(403)
    expect(
      (
        await request.get(userUrl, { headers: bearer(customer.token) })
      ).status(),
    ).toBe(404)
    expect(
      (await request.get(adminUrl, { headers: bearer(owner.token) })).status(),
    ).toBe(404)
    expect(
      (
        await request.get('/v1/orders/nope/tracking', {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.get('/v1/admin/orders/nope/tracking', {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(400)
  } finally {
    await f.close()
  }
})
