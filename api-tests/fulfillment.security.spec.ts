import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04D-1 fulfillment JWT, RBAC and mass-assignment boundary', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const id = randomUUID()
    const url = `/v1/admin/orders/${id}/fulfillment/start`
    const data = { requestId: randomUUID() }
    expect((await request.post(url, { data })).status()).toBe(401)
    expect(
      (
        await request.post(url, { headers: bearer(customer.token), data })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.get('/v1/admin/orders', {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(url, {
          headers: bearer(owner.token),
          data: { ...data, status: 'DELIVERED' },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(url, { headers: bearer(owner.token), data })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(`/v1/admin/orders/${id}/fulfillment/ship`, {
          headers: bearer(owner.token),
          data: {
            requestId: randomUUID(),
            carrier: 'UPS',
            trackingNumber: 'x',
          },
        })
      ).status(),
    ).toBe(400)
  } finally {
    await f.close()
  }
})
