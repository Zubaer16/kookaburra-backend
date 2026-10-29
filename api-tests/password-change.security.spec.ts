import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'
import { hashPassword } from '../src/auth/password'

test('05A-4 security: authentication, role isolation, secret validation and wrong password', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const original = `Original-${randomUUID()}-Aa1!`
  const next = `Next-${randomUUID()}-Aa1!`
  try {
    const customer = await f.account('CUSTOMER')
    const admin = await f.account('OWNER')
    await f.db.user.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(original) },
    })
    const endpoint = '/v1/auth/change-password'
    await assertSafeError(
      await request.post(endpoint, {
        data: { currentPassword: original, newPassword: next },
      }),
      401,
    )
    await assertSafeError(
      await request.post(endpoint, {
        headers: bearer(admin.token),
        data: { currentPassword: original, newPassword: next },
      }),
      401,
    )
    await assertSafeError(
      await request.post(endpoint, {
        headers: bearer(customer.token),
        data: { currentPassword: 'invalid-password', newPassword: next },
      }),
      401,
    )
    await assertSafeError(
      await request.post(endpoint, {
        headers: bearer(customer.token),
        data: { currentPassword: original, newPassword: original },
      }),
      400,
    )
    await assertSafeError(
      await request.post(endpoint, {
        headers: bearer(customer.token),
        data: { currentPassword: original, newPassword: 'short' },
      }),
      400,
    )
    await assertSafeError(
      await request.post(endpoint, {
        headers: bearer(customer.token),
        data: { currentPassword: original, newPassword: next, role: 'OWNER' },
      }),
      400,
    )
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: customer.id } }))
        .sessionVersion,
    ).toBe(0)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: customer.id, action: 'customer.password_changed' },
      }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
