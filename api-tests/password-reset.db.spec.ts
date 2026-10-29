import { createHash, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { hashPassword, verifyPassword } from '../src/auth/password'
import {
  decryptEmailActionToken,
  type EncryptedActionToken,
} from '../src/auth/email-verification.crypto'

async function issued(f: CatalogTestFixture, userId: string) {
  const events = await f.db.outboxEvent.findMany({
    where: {
      eventType: 'auth.password_reset.requested',
      payload: { path: ['userId'], equals: userId },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  expect(events).toHaveLength(1)
  const event = events[0]!
  const payload = event.payload as unknown as {
    eventId: string
    token: EncryptedActionToken
  }
  const token = decryptEmailActionToken(
    process.env.AUTH_ACTION_TOKEN_ENCRYPTION_KEY!,
    payload.token,
    `${userId}:${payload.eventId}`,
  )
  expect(JSON.stringify(event.payload)).not.toContain(token)
  return { token, event }
}
async function cleanup(f: CatalogTestFixture, userId: string) {
  await f.db.outboxEvent.deleteMany({
    where: {
      eventType: 'auth.password_reset.requested',
      payload: { path: ['userId'], equals: userId },
    },
  })
}

test('05A-6 DB: encrypted token, no enumeration, one-time reset revokes all sessions', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  const oldPassword = `Start-${randomUUID()}-Aa1!`
  const nextPassword = `Reset-${randomUUID()}-Aa1!`
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    await f.db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(oldPassword) },
    })
    const session = await request.post('/v1/auth/login', {
      data: { email: customer.email, password: oldPassword },
    })
    expect(session.status()).toBe(200)
    const tokens = await session.json()
    const path = '/v1/auth/password-reset/request'
    for (const email of [
      customer.email,
      `missing-${randomUUID()}@example.test`,
    ]) {
      const res = await request.post(path, { data: { email } })
      expect(res.status()).toBe(202)
      expect(await res.json()).toEqual({ accepted: true })
    }
    const first = await issued(f, userId)
    const challenge = await f.db.passwordResetChallenge.findUniqueOrThrow({
      where: { userId },
    })
    expect(challenge.tokenHash).toBe(
      createHash('sha256').update(first.token).digest('hex'),
    )
    expect(challenge.windowCount).toBe(1)
    expect(
      (await request.post(path, { data: { email: customer.email } })).status(),
    ).toBe(202)
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'auth.password_reset.requested',
          payload: { path: ['userId'], equals: userId },
        },
      }),
    ).toBe(1)
    const completed = await request.post('/v1/auth/password-reset/confirm', {
      data: { token: first.token, newPassword: nextPassword },
    })
    expect(completed.status()).toBe(200)
    expect(await completed.json()).toEqual({
      changed: true,
      sessionsRevoked: true,
    })
    const after = await f.db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(after.sessionVersion).toBe(1)
    expect(await verifyPassword(nextPassword, after.passwordHash)).toBe(true)
    expect(
      await f.db.authSession.count({ where: { userId, revokedAt: null } }),
    ).toBe(0)
    expect(
      (
        await request.get('/v1/auth/me', { headers: bearer(customer.token) })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.get('/v1/auth/me', {
          headers: bearer(tokens.accessToken),
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/auth/refresh', {
          data: { refreshToken: tokens.refreshToken },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: customer.email, password: oldPassword },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: customer.email, password: nextPassword },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post('/v1/auth/password-reset/confirm', {
          data: { token: first.token, newPassword: nextPassword },
        })
      ).status(),
    ).toBe(400)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: userId, action: 'customer.password_reset_completed' },
      }),
    ).toBe(1)
  } finally {
    if (userId) await cleanup(f, userId)
    await f.close()
  }
})

test('05A-6 DB: resend invalidates older token, expiry, rate window, concurrency', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    const path = '/v1/auth/password-reset/request'
    expect(
      (await request.post(path, { data: { email: customer.email } })).status(),
    ).toBe(202)
    const old = await issued(f, userId)
    await f.db.passwordResetChallenge.update({
      where: { userId },
      data: { requestedAt: new Date(Date.now() - 61_000) },
    })
    await request.post(path, { data: { email: customer.email } })
    const next = await issued(f, userId)
    expect(next.token).not.toBe(old.token)
    expect(
      (
        await request.post('/v1/auth/password-reset/confirm', {
          data: { token: old.token, newPassword: `Next-${randomUUID()}-Aa1!` },
        })
      ).status(),
    ).toBe(400)
    await f.db.passwordResetChallenge.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(
      (
        await request.post('/v1/auth/password-reset/confirm', {
          data: { token: next.token, newPassword: `Next-${randomUUID()}-Aa1!` },
        })
      ).status(),
    ).toBe(400)
    await f.db.passwordResetChallenge.update({
      where: { userId },
      data: {
        requestedAt: new Date(Date.now() - 61_000),
        expiresAt: new Date(Date.now() + 600_000),
        windowCount: 5,
      },
    })
    expect(
      (await request.post(path, { data: { email: customer.email } })).status(),
    ).toBe(202)
    expect(
      (
        await f.db.passwordResetChallenge.findUniqueOrThrow({
          where: { userId },
        })
      ).tokenHash,
    ).toBe(createHash('sha256').update(next.token).digest('hex'))
    // Expired hour window lets the customer request again.
    await f.db.passwordResetChallenge.update({
      where: { userId },
      data: { windowStartAt: new Date(Date.now() - 3_700_000) },
    })
    await request.post(path, { data: { email: customer.email } })
    const final = await issued(f, userId)
    expect(final.token).not.toBe(next.token)
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        request.post('/v1/auth/password-reset/confirm', {
          data: {
            token: final.token,
            newPassword: `Final-${randomUUID()}-Aa1!`,
          },
        }),
      ),
    )
    expect(concurrent.map((r) => r.status()).sort()).toEqual([200, 400])
    expect(
      await f.db.auditEvent.count({
        where: { actorId: userId, action: 'customer.password_reset_completed' },
      }),
    ).toBe(1)
  } finally {
    if (userId) await cleanup(f, userId)
    await f.close()
  }
})

test('05A-6 DB: normal password change revokes outstanding reset token', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  const original = `Original-${randomUUID()}-Aa1!`
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    await f.db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(original) },
    })
    await request.post('/v1/auth/password-reset/request', {
      data: { email: customer.email },
    })
    const { token } = await issued(f, userId)
    expect(
      (
        await request.post('/v1/auth/change-password', {
          headers: bearer(customer.token),
          data: {
            currentPassword: original,
            newPassword: `Changed-${randomUUID()}-Aa1!`,
          },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post('/v1/auth/password-reset/confirm', {
          data: { token, newPassword: `Recovery-${randomUUID()}-Aa1!` },
        })
      ).status(),
    ).toBe(400)
  } finally {
    if (userId) await cleanup(f, userId)
    await f.close()
  }
})
