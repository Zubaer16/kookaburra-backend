import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

const address = {
  recipientName: 'Test Customer',
  phone: '+12025550123',
  addressLine1: '123 Example Road',
  city: 'Dhaka',
  countryCode: 'BD',
}

test('05A-2 security: no bearer, staff forbidden, ownership and no mass-assignment', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const user = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const auth = bearer(user.token)
    for (const route of ['/v1/account/profile', '/v1/account/addresses']) {
      await assertSafeError(await request.get(route), 401)
      await assertSafeError(
        await request.get(route, { headers: bearer(staff.token) }),
        403,
      )
    }
    await assertSafeError(
      await request.patch('/v1/account/profile', {
        headers: auth,
        data: { role: 'OWNER', displayName: 'x' },
      }),
      400,
    )
    await assertSafeError(
      await request.patch('/v1/account/profile', {
        headers: auth,
        data: { displayName: '  ' },
      }),
      400,
    )
    await assertSafeError(
      await request.patch('/v1/account/profile', {
        headers: auth,
        data: { email: 'attacker@example.test' },
      }),
      400,
    )
    for (const data of [
      { ...address, userId: other.id },
      { ...address, isDefault: 'yes' },
      { ...address, countryCode: 'bd' },
      { ...address, phone: '12345' },
      { ...address, label: ' ' },
      { ...address, addressLine1: ' ' },
      { ...address, id: randomUUID() },
    ]) {
      await assertSafeError(
        await request.post('/v1/account/addresses', { headers: auth, data }),
        400,
      )
    }
    const saved = await request.post('/v1/account/addresses', {
      headers: auth,
      data: address,
    })
    expect(saved.status()).toBe(201)
    const id = (await saved.json()).id
    await assertSafeError(
      await request.get(`/v1/account/addresses/${id}`, {
        headers: bearer(other.token),
      }),
      404,
    )
    await assertSafeError(
      await request.patch(`/v1/account/addresses/${id}`, {
        headers: bearer(other.token),
        data: { city: 'Other' },
      }),
      404,
    )
    await assertSafeError(
      await request.delete(`/v1/account/addresses/${id}`, {
        headers: bearer(other.token),
      }),
      404,
    )
    await assertSafeError(
      await request.patch(`/v1/account/addresses/${id}`, {
        headers: auth,
        data: { userId: other.id },
      }),
      400,
    )
    await assertSafeError(
      await request.patch(`/v1/account/addresses/${id}`, {
        headers: auth,
        data: {},
      }),
      400,
    )
    await assertSafeError(
      await request.patch(`/v1/account/addresses/${id}`, {
        headers: auth,
        data: { isDefault: false },
      }),
      409,
    )
    await assertSafeError(
      await request.get('/v1/account/addresses/not-a-uuid', { headers: auth }),
      400,
    )
    expect(
      (
        await (
          await request.get(`/v1/account/addresses/${id}`, { headers: auth })
        ).json()
      ).city,
    ).toBe('Dhaka')
  } finally {
    await f.close()
  }
})
