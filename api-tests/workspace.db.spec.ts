import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test('A1: persistent role grants and staff lifecycle via real PostgreSQL', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let createdStaff: string | undefined
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const auth = bearer(owner.token)
    const roles = await request.get('/v1/admin/roles', { headers: auth })
    expect(roles.status()).toBe(200)
    const data = (await roles.json()) as {
      key: string
      permissions: string[]
    }[]
    expect(data.map((x) => x.key).sort()).toEqual([
      'ANALYST',
      'CATALOG_EDITOR',
      'MANAGER',
      'OWNER',
      'SUPPORT',
    ])
    expect(data.find((x) => x.key === 'OWNER')!.permissions).toContain(
      'staff.manage',
    )
    const profile = await request.get('/v1/admin/auth/me', {
      headers: bearer(staff.token),
    })
    expect(profile.status()).toBe(200)
    expect(await profile.json()).toMatchObject({
      staffRole: 'SUPPORT',
      permissions: expect.arrayContaining(['orders.manage']),
    })

    // Create as Catalog Editor, verify Admin login + permission on SAME old JWT.
    const email = `a1-${f.key}@example.test`
    const password = `Workspace-${f.key}-Pass123!`
    const created = await request.post('/v1/admin/staff', {
      headers: auth,
      data: {
        name: 'QA Catalog Editor',
        email,
        password,
        role: 'CATALOG_EDITOR',
      },
    })
    expect(created.status()).toBe(201)
    const account = await created.json()
    createdStaff = account.id
    expect(account).toMatchObject({
      email,
      role: 'CATALOG_EDITOR',
      status: 'ACTIVE',
    })
    expect(account.passwordHash).toBeUndefined()
    expect(
      (
        await f.db.staffRoleAssignment.findUniqueOrThrow({
          where: { userId: createdStaff },
        })
      ).roleKey,
    ).toBe('CATALOG_EDITOR')
    const login = await request.post('/v1/admin/auth/login', {
      data: { email, password },
    })
    expect(login.status()).toBe(200)
    const editorJwt = (await login.json()).accessToken as string
    const editorProfile = await request.get('/v1/admin/auth/me', {
      headers: bearer(editorJwt),
    })
    expect(await editorProfile.json()).toMatchObject({
      staffRole: 'CATALOG_EDITOR',
      permissions: expect.arrayContaining([
        'catalog.manage',
        'inventory.adjust',
      ]),
    })
    expect(
      (
        await request.get('/v1/admin/products', { headers: bearer(editorJwt) })
      ).status(),
    ).toBe(200)
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(editorJwt),
      data: {
        name: 'Role managed',
        slug: f.slug('a1-role'),
      },
    })
    expect(category.status()).toBe(201)
    await assertSafeError(
      await request.get('/v1/admin/staff', { headers: bearer(editorJwt) }),
      403,
    )

    const updated = await request.patch(`/v1/admin/staff/${createdStaff}`, {
      headers: auth,
      data: { role: 'ANALYST', name: 'QA Analyst' },
    })
    expect(updated.status()).toBe(200)
    expect((await updated.json()).role).toBe('ANALYST')
    // Old JWT must not keep CATALOG_EDITOR power after role change.
    await assertSafeError(
      await request.post('/v1/admin/categories', {
        headers: bearer(editorJwt),
        data: {
          name: 'Denied',
          slug: f.slug('denied'),
        },
      }),
      403,
    )
    expect(
      (
        await request
          .get('/v1/admin/auth/me', { headers: bearer(editorJwt) })
          .then((r) => r.json())
      ).staffRole,
    ).toBe('ANALYST')
    const disabled = await request.patch(`/v1/admin/staff/${createdStaff}`, {
      headers: auth,
      data: { status: 'DISABLED' },
    })
    expect(disabled.status()).toBe(200)
    await assertSafeError(
      await request.get('/v1/admin/auth/me', { headers: bearer(editorJwt) }),
      401,
    )
    const events = await f.db.auditEvent.count({
      where: { actorId: owner.id, action: { startsWith: 'rbac.staff.' } },
    })
    expect(events).toBeGreaterThanOrEqual(2)
  } finally {
    if (createdStaff)
      await f.db.user.deleteMany({ where: { id: createdStaff } })
    await f.close()
  }
})

test('A1: changed persisted role grants affect authenticated requests without JWT refresh', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let original: string[] | undefined
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const auth = bearer(owner.token)
    const originalPermissions = await f.db.staffRolePermission.findMany({
      where: { roleKey: 'SUPPORT' },
    })
    original = originalPermissions.map((p) => p.permissionKey)
    const blocked = await request.post('/v1/admin/categories', {
      headers: bearer(staff.token),
      data: {
        name: 'Not allowed',
        slug: f.slug('pre-grant'),
      },
    })
    await assertSafeError(blocked, 403)
    const patched = await request.patch('/v1/admin/roles/SUPPORT/permissions', {
      headers: auth,
      data: { permissions: [...original, 'catalog.manage'] },
    })
    expect(patched.status()).toBe(200)
    const accepted = await request.post('/v1/admin/categories', {
      headers: bearer(staff.token),
      data: {
        name: 'Allowed',
        slug: f.slug('post-grant'),
      },
    })
    expect(accepted.status()).toBe(201)
    const auditor = await f.db.auditEvent.findFirst({
      where: {
        actorId: owner.id,
        action: 'rbac.role.permissions.update',
        targetId: 'SUPPORT',
      },
    })
    expect(auditor).not.toBeNull()
  } finally {
    if (original)
      await f.db.$transaction(async (tx) => {
        await tx.staffRolePermission.deleteMany({
          where: { roleKey: 'SUPPORT' },
        })
        await tx.staffRolePermission.createMany({
          data: original!.map((permissionKey) => ({
            roleKey: 'SUPPORT',
            permissionKey,
          })),
        })
      })
    await f.close()
  }
})
