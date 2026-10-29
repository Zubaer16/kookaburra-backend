import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test('05A-3 security: bearer, backend RBAC, validation, no staff identity leakage', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    for (const path of [
      '/v1/admin/customers',
      `/v1/admin/customers/${customer.id}`,
    ]) {
      await assertSafeError(await request.get(path), 401)
      await assertSafeError(
        await request.get(path, { headers: bearer(customer.token) }),
        403,
      )
    }
    // Catalog editor has no customers.view, and role is loaded on EACH request.
    await f.db.staffRoleAssignment.upsert({
      where: { userId: staff.id },
      create: { userId: staff.id, roleKey: 'CATALOG_EDITOR' },
      update: { roleKey: 'CATALOG_EDITOR' },
    })
    await assertSafeError(
      await request.get('/v1/admin/customers', {
        headers: bearer(staff.token),
      }),
      403,
    )
    await assertSafeError(
      await request.get(`/v1/admin/customers/${customer.id}`, {
        headers: bearer(staff.token),
      }),
      403,
    )
    // Manager role may have customers.view but never gets password/token data.
    await f.db.staffRoleAssignment.update({
      where: { userId: staff.id },
      data: { roleKey: 'MANAGER' },
    })
    const allowed = await request.get(`/v1/admin/customers/${customer.id}`, {
      headers: bearer(staff.token),
    })
    expect(allowed.status()).toBe(200)
    for (const secret of [
      'passwordHash',
      'sessions',
      'tokenHash',
      'shippingAddress',
      'refreshToken',
    ])
      expect(await allowed.json()).not.toHaveProperty(secret)
    const headers = bearer(owner.token)
    for (const params of [
      { page: '0' },
      { page: '-1' },
      { page: '1.5' },
      { page: 'abc' },
      { limit: '0' },
      { limit: '51' },
      { limit: '2.5' },
      { search: ' ' },
      { search: 'z'.repeat(121) },
      { status: 'OWNER' },
      { role: 'OWNER' },
    ]) {
      await assertSafeError(
        await request.get('/v1/admin/customers', { headers, params }),
        400,
      )
    }
    await assertSafeError(
      await request.get('/v1/admin/customers/not-a-uuid', { headers }),
      400,
    )
  } finally {
    await f.close()
  }
})
