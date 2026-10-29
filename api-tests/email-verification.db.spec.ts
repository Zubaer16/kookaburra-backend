import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import {
  decryptEmailActionToken,
  type EncryptedActionToken,
} from '../src/auth/email-verification.crypto'

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex')
async function issued(f: CatalogTestFixture, userId: string) {
  const outbox = await f.db.outboxEvent.findMany({
    where: {
      eventType: 'auth.email_verification.requested',
      payload: { path: ['userId'], equals: userId },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  expect(outbox).toHaveLength(1)
  const payload = outbox[0]!.payload as unknown as {
    userId: string
    eventId: string
    token: EncryptedActionToken
    expiresAt: string
  }
  const token = decryptEmailActionToken(
    process.env.AUTH_ACTION_TOKEN_ENCRYPTION_KEY!,
    payload.token,
    `${userId}:${payload.eventId}`,
  )
  expect(JSON.stringify(outbox[0]!.payload)).not.toContain(token)
  return { token, outbox: outbox[0]!, payload }
}

// Explicit cleanup of the only new outbox event type, restricted to own fixture user.
async function cleanup(f: CatalogTestFixture, userId: string) {
  await f.db.outboxEvent.deleteMany({
    where: {
      eventType: 'auth.email_verification.requested',
      payload: { path: ['userId'], equals: userId },
    },
  })
}

test('05A-5 real DB: encrypted outbox, durable cooldown, one-time consumption, profile flag', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    const before = await request.get('/v1/account/profile', {
      headers: bearer(customer.token),
    })
    expect(before.status()).toBe(200)
    expect((await before.json()).emailVerified).toBe(false)
    const path = '/v1/auth/email-verification/request'
    expect(
      (await request.post(path, { headers: bearer(customer.token) })).status(),
    ).toBe(202)
    const { token, outbox } = await issued(f, userId)
    expect(outbox.status).toBe('PENDING')
    expect(
      (
        await f.db.emailVerificationChallenge.findUniqueOrThrow({
          where: { userId },
        })
      ).tokenHash,
    ).toBe(digest(token))
    expect(
      (await request.post(path, { headers: bearer(customer.token) })).status(),
    ).toBe(202)
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'auth.email_verification.requested',
          payload: { path: ['userId'], equals: userId },
        },
      }),
    ).toBe(1)
    const result = await request.post('/v1/auth/email-verification/confirm', {
      data: { token },
    })
    expect(result.status()).toBe(200)
    expect(await result.json()).toEqual({ accepted: true })
    expect(
      (
        await f.db.emailVerificationChallenge.findUniqueOrThrow({
          where: { userId },
        })
      ).consumedAt,
    ).not.toBeNull()
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: userId } }))
        .emailVerifiedAt,
    ).not.toBeNull()
    const after = await request.get('/v1/account/profile', {
      headers: bearer(customer.token),
    })
    expect((await after.json()).emailVerified).toBe(true)
    expect(
      (
        await request.post('/v1/auth/email-verification/confirm', {
          data: { token },
        })
      ).status(),
    ).toBe(400)
    expect(
      (await request.post(path, { headers: bearer(customer.token) })).status(),
    ).toBe(202)
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'auth.email_verification.requested',
          payload: { path: ['userId'], equals: userId },
        },
      }),
    ).toBe(1)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: userId, action: 'customer.email_verified' },
      }),
    ).toBe(1)
  } finally {
    if (userId) await cleanup(f, userId)
    await f.close()
  }
})

test('05A-5 real DB: resend invalidates previous token; expired tokens cannot verify', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    const path = '/v1/auth/email-verification/request'
    expect(
      (await request.post(path, { headers: bearer(customer.token) })).status(),
    ).toBe(202)
    const first = await issued(f, userId)
    await f.db.emailVerificationChallenge.update({
      where: { userId },
      data: { requestedAt: new Date(Date.now() - 61_000) },
    })
    expect(
      (await request.post(path, { headers: bearer(customer.token) })).status(),
    ).toBe(202)
    const second = await issued(f, userId)
    expect(second.token).not.toBe(first.token)
    expect(
      (
        await request.post('/v1/auth/email-verification/confirm', {
          data: { token: first.token },
        })
      ).status(),
    ).toBe(400)
    await f.db.emailVerificationChallenge.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(
      (
        await request.post('/v1/auth/email-verification/confirm', {
          data: { token: second.token },
        })
      ).status(),
    ).toBe(400)
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: userId } }))
        .emailVerifiedAt,
    ).toBeNull()
  } finally {
    if (userId) await cleanup(f, userId)
    await f.close()
  }
})

test('05A-5 real DB: parallel verification token consumes once', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    await request.post('/v1/auth/email-verification/request', {
      headers: bearer(customer.token),
    })
    const { token } = await issued(f, userId)
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        request.post('/v1/auth/email-verification/confirm', {
          data: { token },
        }),
      ),
    )
    expect(results.map((r) => r.status()).sort()).toEqual([200, 400])
    expect(
      await f.db.auditEvent.count({
        where: { actorId: userId, action: 'customer.email_verified' },
      }),
    ).toBe(1)
  } finally {
    if (userId) await cleanup(f, userId)
    await f.close()
  }
})
