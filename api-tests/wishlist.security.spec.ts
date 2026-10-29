import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('05A-1 security: JWT/customer-only and reject malformed or extra-fields merge', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const id = randomUUID()
    expect((await request.get('/v1/wishlist')).status()).toBe(401)
    expect(
      (
        await request.get('/v1/wishlist', { headers: bearer(staff.token) })
      ).status(),
    ).toBe(403)
    expect((await request.put(`/v1/wishlist/${id}`)).status()).toBe(401)
    expect(
      (
        await request.put(`/v1/wishlist/${id}`, {
          headers: bearer(staff.token),
        })
      ).status(),
    ).toBe(403)
    const auth = bearer(customer.token)
    const invalid: unknown[] = [
      { productIds: [id, id] },
      { productIds: ['preview-p-001'] },
      { productIds: [id], userId: staff.id },
      { productIds: 'not-an-array' },
      { productIds: Array.from({ length: 101 }, (_, i) => `${i}`) },
      {},
      { productIds: null },
    ]
    for (const data of invalid) {
      const response = await request.post('/v1/wishlist/merge', {
        headers: auth,
        data,
      })
      expect(response.status(), JSON.stringify(data)).toBe(400)
    }
    expect(
      (
        await request.post('/v1/wishlist/merge', {
          headers: bearer(staff.token),
          data: { productIds: [id] },
        })
      ).status(),
    ).toBe(403)
    expect(
      (await request.put(`/v1/wishlist/${id}`, { headers: auth })).status(),
    ).toBe(404)
    expect(
      (
        await request.put('/v1/wishlist/preview-p-001', { headers: auth })
      ).status(),
    ).toBe(400)
    const noOp = await request.post('/v1/wishlist/merge', {
      headers: auth,
      data: { productIds: [] },
    })
    expect(noOp.status()).toBe(200)
    expect((await noOp.json()).count).toBe(0)
  } finally {
    await f.close()
  }
})
