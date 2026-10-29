import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from './catalog-test-support'

test('05A-6 security: no enumeration for missing/staff/disabled and no privilege escalation', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let id = ''
  try {
    const customer = await f.account('CUSTOMER')
    id = customer.id
    const staff = await f.account('OWNER')
    const missing = `missing-${randomUUID()}@example.test`
    const path = '/v1/auth/password-reset/request'
    for (const email of [customer.email, staff.email, missing]) {
      const res = await request.post(path, { data: { email } })
      expect(res.status()).toBe(202)
      expect(await res.json()).toEqual({ accepted: true })
    }
    expect(
      await f.db.passwordResetChallenge.count({ where: { userId: staff.id } }),
    ).toBe(0)
    expect(
      (await request.post(path, { data: { email: 'bad-email' } })).status(),
    ).toBe(400)
    expect(
      (
        await request.post(path, {
          data: { email: customer.email, role: 'OWNER' },
        })
      ).status(),
    ).toBe(400)
    const confirm = '/v1/auth/password-reset/confirm'
    for (const data of [
      { token: 'short', newPassword: 'Strong-password-1234!' },
      {
        token: randomBytes(48).toString('base64url'),
        newPassword: 'Strong-password-1234!',
        role: 'OWNER',
      },
      { token: randomBytes(48).toString('base64url'), newPassword: 'weak' },
      {
        token: randomBytes(48).toString('base64url'),
        newPassword: 'Strong-password-1234!',
      },
    ]) {
      expect((await request.post(confirm, { data })).status()).toBe(400)
    }
    await f.db.user.update({ where: { id }, data: { status: 'DISABLED' } })
    expect(
      (await request.post(path, { data: { email: customer.email } })).status(),
    ).toBe(202)
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'auth.password_reset.requested',
          payload: { path: ['userId'], equals: id },
        },
      }),
    ).toBe(1)
  } finally {
    if (id)
      await f.db.outboxEvent.deleteMany({
        where: {
          eventType: 'auth.password_reset.requested',
          payload: { path: ['userId'], equals: id },
        },
      })
    await f.close()
  }
})
