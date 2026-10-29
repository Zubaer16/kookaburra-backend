import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04D-2A return access boundary and mass-assignment rejection', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const orderId = randomUUID()
    const returnId = randomUUID()
    const createUrl = `/v1/orders/${orderId}/returns`
    const data = {
      requestId: randomUUID(),
      orderLineId: randomUUID(),
      quantity: 1,
      reason: 'OTHER',
    }
    expect((await request.post(createUrl, { data })).status()).toBe(401)
    expect(
      (
        await request.post(createUrl, { headers: bearer(owner.token), data })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(createUrl, {
          headers: bearer(customer.token),
          data: { ...data, stockOnHand: 99 },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(createUrl, { headers: bearer(customer.token), data })
      ).status(),
    ).toBe(404)
    const cancelUrl = `${createUrl}/${returnId}/cancel`
    const cancelBody = { requestId: randomUUID() }
    expect((await request.post(cancelUrl, { data: cancelBody })).status()).toBe(
      401,
    )
    expect(
      (
        await request.post(cancelUrl, {
          headers: bearer(owner.token),
          data: cancelBody,
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(cancelUrl, {
          headers: bearer(customer.token),
          data: { ...cancelBody, status: 'RESTOCKED' },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(cancelUrl, {
          headers: bearer(customer.token),
          data: cancelBody,
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(`${createUrl}/invalid/cancel`, {
          headers: bearer(customer.token),
          data: cancelBody,
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(cancelUrl, {
          headers: bearer(customer.token),
          data: { requestId: 'invalid' },
        })
      ).status(),
    ).toBe(400)
    const admin = `/v1/admin/orders/${orderId}/returns/${returnId}/restock`
    expect(
      (
        await request.post(admin, { data: { requestId: randomUUID() } })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post(admin, {
          headers: bearer(customer.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(admin, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID(), quantity: 999 },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(admin, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(404)
    const replacementBase = `/v1/admin/orders/${orderId}/replacements`
    const authUrl = `${replacementBase}/returns/${returnId}/authorize`
    expect(
      (
        await request.post(authUrl, { data: { requestId: randomUUID() } })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post(authUrl, {
          headers: bearer(customer.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.post(authUrl, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID(), quantity: 100 },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await request.post(authUrl, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(`${replacementBase}/${randomUUID()}/ship`, {
          headers: bearer(owner.token),
          data: {
            requestId: randomUUID(),
            carrier: 'DHL',
            trackingNumber: 'TRACK123',
            amountMinor: 0,
          },
        })
      ).status(),
    ).toBe(400)
    expect(
      (await request.get(`/v1/orders/${orderId}/replacements`)).status(),
    ).toBe(401)
    expect(
      (
        await request.get(`/v1/orders/${orderId}/replacements`, {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await request.get(`/v1/orders/${orderId}/replacements`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(404)
  } finally {
    await f.close()
  }
})
