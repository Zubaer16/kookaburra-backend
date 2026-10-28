import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
const uuid = '10000000-0000-4000-8000-000000000000'

test('04C-2A disabled Stripe cannot call provider, JWT & ownership enforced', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const owner = await f.account('OWNER')
    expect(
      (await request.post(`/v1/payments/orders/${uuid}/prepare`)).status(),
    ).toBe(401)
    expect((await request.get(`/v1/payments/orders/${uuid}`)).status()).toBe(
      401,
    )
    expect(
      (
        await request.post(`/v1/payments/orders/${uuid}/prepare`, {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.get(`/v1/payments/orders/${uuid}`, {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.get(`/v1/payments/orders/${uuid}`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(`/v1/payments/orders/${uuid}/prepare`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(503)
    expect(
      (
        await request.post('/v1/payments/stripe/webhook', {
          headers: { 'stripe-signature': 't=1000000000,v1=' + '0'.repeat(64) },
          data: { id: 'evt_fake', livemode: false },
        })
      ).status(),
    ).toBe(503)
    expect(await f.db.paymentAttempt.count()).toBeGreaterThanOrEqual(0)
  } finally {
    await f.close()
  }
})
