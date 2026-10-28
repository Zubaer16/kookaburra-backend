import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04C-2B2C1 refund ledger protected by JWT/OWNER and customer ownership', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const customer = await f.account('CUSTOMER')
    const uuid = randomUUID()
    const uri = `/v1/admin/payments/orders/${uuid}/refunds`
    const dto = { requestId: randomUUID(), amountMinor: 1, reason: 'OTHER' }
    expect((await request.post(uri, { data: dto })).status()).toBe(401)
    expect(
      (
        await request.post(uri, { headers: bearer(customer.token), data: dto })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(uri, { headers: bearer(staff.token), data: dto })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(uri, {
          headers: bearer(owner.token),
          data: { ...dto, status: 'SUCCEEDED' },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(uri, { headers: bearer(owner.token), data: dto })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.get(`/v1/payments/orders/${uuid}/refunds`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
