import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const address = {
  recipientName: 'Test Customer',
  phone: '+12025550123',
  addressLine1: '1 Sample Road',
  city: 'New York',
  countryCode: 'US',
}

test('04C-1 strict JWT, ownership and order input rejection', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const owner = await f.account('OWNER')
    const valid = {
      requestId: randomUUID(),
      reservationId: randomUUID(),
      shippingAddress: address,
    }
    expect((await request.post('/v1/orders', { data: valid })).status()).toBe(
      401,
    )
    expect((await request.get('/v1/orders')).status()).toBe(401)
    expect(
      (
        await request.post('/v1/orders', {
          headers: bearer(owner.token),
          data: valid,
        })
      ).status(),
    ).toBe(403)
    for (const invalid of [
      { requestId: valid.requestId, reservationId: valid.reservationId },
      { ...valid, shippingAddress: null },
      { ...valid, totalMinor: 1 },
      { ...valid, status: 'PAID' },
      { ...valid, userId: other.id },
      { ...valid, reservationId: 'broken' },
      { ...valid, requestId: 'broken' },
      { ...valid, shippingAddress: { ...address, countryCode: 'us' } },
      { ...valid, shippingAddress: { ...address, phone: 'abc' } },
      { ...valid, shippingAddress: { ...address, totalMinor: 0 } },
      { ...valid, shippingAddress: { ...address, addressLine1: '' } },
    ]) {
      expect(
        (
          await request.post('/v1/orders', {
            headers: bearer(customer.token),
            data: invalid,
          })
        ).status(),
        JSON.stringify(invalid),
      ).toBe(400)
    }
    expect(
      (
        await request.post('/v1/orders', {
          headers: bearer(customer.token),
          data: valid,
        })
      ).status(),
    ).toBe(404)
    const phantom = randomUUID()
    expect(
      (
        await request.get(`/v1/orders/${phantom}`, {
          headers: bearer(other.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(`/v1/orders/${phantom}/cancel`, {
          headers: bearer(other.token),
        })
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
