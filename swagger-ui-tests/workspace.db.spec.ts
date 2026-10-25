import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

// Every new Workspace operation is clicked and executed through real Swagger UI.
test('A1: five workspace Swagger routes execute valid, invalid and unauthorized requests', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let staffId: string | undefined
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/roles', 401)
    await swaggerExecute(page, 'POST', '/v1/admin/staff', 401, {
      email: `noauth-${f.key}@example.test`,
      name: 'No JWT',
      password: 'NotAllowedPassword123!',
      role: 'ANALYST',
    })
    await authorizeInSwagger(page, staff.token)
    await swaggerExecute(page, 'GET', '/v1/admin/roles', 403)
    await swaggerExecute(page, 'GET', '/v1/admin/staff', 403)
    await openSwagger(page)
    await authorizeInSwagger(page, owner.token)
    const ownerProfile = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/auth/me',
      200,
    )
    expect(await ownerProfile.json()).toMatchObject({
      staffRole: 'OWNER',
      permissions: expect.arrayContaining(['staff.manage']),
    })
    const roles = await swaggerExecute(page, 'GET', '/v1/admin/roles', 200)
    expect(
      (await roles.json())?.some(
        (role: { key: string }) => role.key === 'CATALOG_EDITOR',
      ),
    ).toBe(true)
    const list = await swaggerExecute(page, 'GET', '/v1/admin/staff', 200)
    expect(
      (await list.json())?.some((user: { id: string }) => user.id === owner.id),
    ).toBe(true)
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/roles/{key}/permissions',
      400,
      { permissions: ['invalid.permission'] },
      { key: 'SUPPORT' },
    )
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/roles/{key}/permissions',
      403,
      { permissions: [] },
      { key: 'OWNER' },
    )
    const existingGrants = await f.db.staffRolePermission.findMany({
      where: { roleKey: 'ANALYST' },
    })
    const sameGrants = existingGrants.map((x) => x.permissionKey)
    const unchanged = await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/roles/{key}/permissions',
      200,
      { permissions: sameGrants },
      { key: 'ANALYST' },
    )
    expect((await unchanged.json()).permissions).toEqual([...sameGrants].sort())
    await swaggerExecute(page, 'POST', '/v1/admin/staff', 400, {
      name: 'Unknown',
      email: `invalid-${f.key}@example.test`,
      password: 'Password-123456!',
      role: 'OWNER',
    })
    const created = await swaggerExecute(page, 'POST', '/v1/admin/staff', 201, {
      name: 'Swagger Analyst',
      email: `swagger-a1-${f.key}@example.test`,
      password: 'Password-123456!',
      role: 'ANALYST',
    })
    staffId = (await created.json()).id as string
    expect(
      (
        await f.db.staffRoleAssignment.findUniqueOrThrow({
          where: { userId: staffId },
        })
      ).roleKey,
    ).toBe('ANALYST')
    await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/staff/{id}',
      400,
      { role: 'OWNER' },
      { id: staffId },
    )
    const updated = await swaggerExecute(
      page,
      'PATCH',
      '/v1/admin/staff/{id}',
      200,
      { name: 'Swagger Support', role: 'SUPPORT' },
      { id: staffId },
    )
    expect((await updated.json()).role).toBe('SUPPORT')
    expect(
      (
        await f.db.staffRoleAssignment.findUniqueOrThrow({
          where: { userId: staffId },
        })
      ).roleKey,
    ).toBe('SUPPORT')
  } finally {
    if (staffId) await f.db.user.deleteMany({ where: { id: staffId } })
    await f.close()
  }
})
