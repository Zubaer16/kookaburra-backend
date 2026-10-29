import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const a = (suffix: string) => ({
  label: suffix,
  recipientName: 'Customer Sample',
  phone: '+12025550123',
  addressLine1: `123 ${suffix} Street`,
  city: 'New York',
  countryCode: 'US',
})

test('05A-2 real DB: customer profile and private address CRUD, defaults, audit', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const auth = bearer(customer.token)
    const otherAuth = bearer(other.token)
    const original = await request.get('/v1/account/profile', { headers: auth })
    expect(original.status()).toBe(200)
    expect(await original.json()).toMatchObject({
      id: customer.id,
      email: customer.email,
      role: 'CUSTOMER',
      displayName: '',
    })
    const changed = await request.patch('/v1/account/profile', {
      headers: auth,
      data: { displayName: '  Alex Doe  ' },
    })
    expect(changed.status()).toBe(200)
    expect((await changed.json()).displayName).toBe('Alex Doe')
    expect(
      (
        await (
          await request.get('/v1/account/profile', { headers: otherAuth })
        ).json()
      ).displayName,
    ).toBe('')
    const created = await request.post('/v1/account/addresses', {
      headers: auth,
      data: a('Home'),
    })
    expect(created.status()).toBe(201)
    const home = await created.json()
    expect(home.isDefault).toBe(true)
    expect(home).not.toHaveProperty('userId')
    const second = await request.post('/v1/account/addresses', {
      headers: auth,
      data: a('Office'),
    })
    expect(second.status()).toBe(201)
    const office = await second.json()
    expect(office.isDefault).toBe(false)
    const list = await request.get('/v1/account/addresses', { headers: auth })
    expect(list.status()).toBe(200)
    expect((await list.json()).count).toBe(2)
    expect(
      (
        await (
          await request.get('/v1/account/addresses', { headers: otherAuth })
        ).json()
      ).count,
    ).toBe(0)
    const selectDefault = await request.patch(
      `/v1/account/addresses/${office.id}`,
      { headers: auth, data: { isDefault: true } },
    )
    expect(selectDefault.status()).toBe(200)
    expect((await selectDefault.json()).isDefault).toBe(true)
    expect(
      (
        await (
          await request.get(`/v1/account/addresses/${home.id}`, {
            headers: auth,
          })
        ).json()
      ).isDefault,
    ).toBe(false)
    expect(
      (
        await request.patch(`/v1/account/addresses/${office.id}`, {
          headers: auth,
          data: { isDefault: false },
        })
      ).status(),
    ).toBe(409)
    const updated = await request.patch(`/v1/account/addresses/${office.id}`, {
      headers: auth,
      data: { city: 'Boston', postalCode: '02101' },
    })
    expect(updated.status()).toBe(200)
    expect(await updated.json()).toMatchObject({
      city: 'Boston',
      postalCode: '02101',
      countryCode: 'US',
    })
    const removed = await request.delete(`/v1/account/addresses/${office.id}`, {
      headers: auth,
    })
    expect(removed.status()).toBe(200)
    expect((await removed.json()).deleted).toBe(true)
    const now = await request.get('/v1/account/addresses', { headers: auth })
    expect((await now.json()).items).toMatchObject([
      { id: home.id, isDefault: true },
    ])
    expect(
      (
        await request.delete(`/v1/account/addresses/${home.id}`, {
          headers: auth,
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await (
          await request.get('/v1/account/addresses', { headers: auth })
        ).json()
      ).count,
    ).toBe(0)
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: customer.id,
          action: { startsWith: 'customer.address_' },
        },
      }),
    ).toBe(6)
  } finally {
    await f.close()
  }
})

test('05A-2 real DB: concurrent insert and default changes obey 10-item limit', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const user = await f.account('CUSTOMER')
    const auth = bearer(user.token)
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        request.post('/v1/account/addresses', {
          headers: auth,
          data: a(`Slot${i}`),
        }),
      ),
    )
    expect(results.filter((r) => r.status() === 201)).toHaveLength(10)
    expect(results.filter((r) => r.status() === 409)).toHaveLength(2)
    const all = await (
      await request.get('/v1/account/addresses', { headers: auth })
    ).json()
    expect(all.count).toBe(10)
    expect(
      all.items.filter((x: { isDefault: boolean }) => x.isDefault),
    ).toHaveLength(1)
    const flips = await Promise.all(
      all.items.slice(0, 2).map((x: { id: string }) =>
        request.patch(`/v1/account/addresses/${x.id}`, {
          headers: auth,
          data: { isDefault: true },
        }),
      ),
    )
    expect(flips.every((r) => r.status() === 200)).toBe(true)
    const after = (
      await (
        await request.get('/v1/account/addresses', { headers: auth })
      ).json()
    ).items
    expect(
      after.filter((x: { isDefault: boolean }) => x.isDefault),
    ).toHaveLength(1)
    const persisted = await f.db.customerAddress.count({
      where: { userId: user.id },
    })
    expect(persisted).toBe(10)
  } finally {
    await f.close()
  }
})
