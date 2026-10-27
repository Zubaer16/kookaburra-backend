import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04B-2: customers only, rejects forged price and cross-account hold access', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const owner = await f.account('OWNER')
    const payload = { requestId: randomUUID(), countryCode: 'US' }
    expect(
      (
        await request.post('/v1/checkout/reservations', { data: payload })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/checkout/reservations', {
          headers: bearer(owner.token),
          data: payload,
        })
      ).status(),
    ).toBe(403)
    for (const invalid of [
      { ...payload, requestId: 'bad' },
      { ...payload, countryCode: 'us' },
      { ...payload, amountDueMinor: 1 },
      { ...payload, quantity: 99 },
      { ...payload, userId: other.id },
    ]) {
      expect(
        (
          await request.post('/v1/checkout/reservations', {
            headers: bearer(customer.token),
            data: invalid,
          })
        ).status(),
      ).toBe(400)
    }
    const fake = randomUUID()
    expect(
      (
        await request.get(`/v1/checkout/reservations/${fake}`, {
          headers: bearer(other.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.delete(`/v1/checkout/reservations/${fake}`, {
          headers: bearer(other.token),
        })
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
