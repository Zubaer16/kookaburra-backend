import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04B-1 role gates, country validation and rate configuration mass assignment', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const admin = await f.account('ADMIN')
    const valid = {
      countryCode: 'CK',
      currency: 'USD',
      shippingMinor: 50,
      freeOverSubtotalMinor: null,
      taxBps: 500,
      enabled: true,
    }
    for (const who of [customer, staff, admin]) {
      expect(
        (
          await request.put('/v1/admin/checkout/rates', {
            headers: bearer(who.token),
            data: valid,
          })
        ).status(),
      ).toBe(403)
      expect(
        (
          await request.get('/v1/admin/checkout/rates', {
            headers: bearer(who.token),
          })
        ).status(),
      ).toBe(403)
    }
    expect((await request.get('/v1/admin/checkout/rates')).status()).toBe(401)
    expect(
      (
        await request.post('/v1/checkout/estimate', {
          headers: bearer(staff.token),
          data: { countryCode: 'CK' },
        })
      ).status(),
    ).toBe(403)
    for (const payload of [
      { countryCode: 'us' },
      { countryCode: 'USA' },
      { countryCode: 'CK', currency: 'USD' },
      { countryCode: 'CK', amountDueMinor: 1 },
      { countryCode: 'CK', shippingMinor: 0 },
    ]) {
      expect(
        (
          await request.post('/v1/checkout/estimate', {
            headers: bearer(customer.token),
            data: payload,
          })
        ).status(),
        JSON.stringify(payload),
      ).toBe(400)
    }
    for (const payload of [
      { ...valid, shippingMinor: -1 },
      { ...valid, taxBps: 10001 },
      { ...valid, enabled: 'true' },
      { ...valid, freeOverSubtotalMinor: -1 },
      { ...valid, countryCode: 'C1' },
      { ...valid, currency: 'usd' },
      { ...valid, userId: owner.id },
    ]) {
      expect(
        (
          await request.put('/v1/admin/checkout/rates', {
            headers: bearer(owner.token),
            data: payload,
          })
        ).status(),
        JSON.stringify(payload),
      ).toBe(400)
    }
  } finally {
    await f.close()
  }
})
