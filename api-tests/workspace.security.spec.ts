import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  assertSafeError,
  bearer,
} from './catalog-test-support'

// Uses REAL local DB, but only our own test accounts and read-only API checks.
test('A1: workspace endpoints reject missing bearer, customer, staff, invalid role and privilege escalation', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const data = {
      name: 'Rejected',
      email: `denied-${f.key}@example.test`,
      password: 'NeverCreated12!',
      role: 'MANAGER',
    }
    for (const [method, path, payload] of [
      ['GET', '/v1/admin/roles', undefined],
      [
        'PATCH',
        '/v1/admin/roles/SUPPORT/permissions',
        { permissions: ['catalog.manage'] },
      ],
      ['GET', '/v1/admin/staff', undefined],
      ['POST', '/v1/admin/staff', data],
      ['PATCH', `/v1/admin/staff/${owner.id}`, { role: 'MANAGER' }],
    ] as const) {
      await assertSafeError(
        await request.fetch(path, {
          method,
          ...(payload && { data: payload }),
        }),
        401,
      )
      for (const token of [customer.token, staff.token]) {
        await assertSafeError(
          await request.fetch(path, {
            method,
            headers: bearer(token),
            ...(payload && { data: payload }),
          }),
          403,
        )
      }
    }
    const auth = bearer(owner.token)
    await assertSafeError(
      await request.patch('/v1/admin/roles/OWNER/permissions', {
        headers: auth,
        data: { permissions: [] },
      }),
      403,
    )
    for (const payload of [
      { permissions: ['unknown.permission'] },
      { permissions: ['dashboard.view', 'dashboard.view'] },
      { permissions: 'dashboard.view' },
      { permissions: ['catalog.manage'], immutable: false },
    ]) {
      await assertSafeError(
        await request.patch('/v1/admin/roles/SUPPORT/permissions', {
          headers: auth,
          data: payload,
        }),
        400,
      )
    }
    for (const payload of [
      { ...data, role: 'OWNER' },
      { ...data, role: 'SUPERADMIN' },
      { ...data, status: 'ACTIVE' },
      { ...data, password: 'short' },
      { ...data, name: '   ' },
    ]) {
      await assertSafeError(
        await request.post('/v1/admin/staff', { headers: auth, data: payload }),
        400,
      )
    }
    await assertSafeError(
      await request.patch(`/v1/admin/staff/${owner.id}`, {
        headers: auth,
        data: { status: 'DISABLED' },
      }),
      403,
    )
    await assertSafeError(
      await request.patch(`/v1/admin/staff/${owner.id}`, {
        headers: auth,
        data: { role: 'SUPPORT' },
      }),
      403,
    )
    const missing = '9d575b8a-5ca0-4144-b30d-1e76874f76fb'
    for (const bad of [
      { name: null },
      { role: null },
      { status: null },
      { status: 'SUSPENDED' },
    ]) {
      await assertSafeError(
        await request.patch(`/v1/admin/staff/${missing}`, {
          headers: auth,
          data: bad,
        }),
        400,
      )
    }
    expect(await f.db.user.count({ where: { email: data.email } })).toBe(0)
    expect(
      await f.db.staffRolePermission.count({ where: { roleKey: 'SUPPORT' } }),
    ).toBeGreaterThan(0)
  } finally {
    await f.close()
  }
})
