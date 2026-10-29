import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { hashPassword, verifyPassword } from '../src/auth/password'

test('05A-4 real DB: password change revokes all previous JWTs/refresh tokens atomically', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const original = `Original-${randomUUID()}-Aa1!`
  const changed = `Changed-${randomUUID()}-Aa1!`
  try {
    const customer = await f.account('CUSTOMER')
    await f.db.user.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(original) },
    })
    const first = await request.post('/v1/auth/login', {
      data: { email: customer.email, password: original },
    })
    expect(first.status()).toBe(200)
    const tokens = await first.json()
    const second = await request.post('/v1/auth/login', {
      data: { email: customer.email, password: original },
    })
    expect(second.status()).toBe(200)
    const otherTokens = await second.json()

    const changedResponse = await request.post('/v1/auth/change-password', {
      headers: bearer(tokens.accessToken),
      data: { currentPassword: original, newPassword: changed },
    })
    expect(changedResponse.status()).toBe(200)
    expect(await changedResponse.json()).toEqual({
      changed: true,
      sessionsRevoked: true,
    })
    const dbUser = await f.db.user.findUniqueOrThrow({
      where: { id: customer.id },
    })
    expect(dbUser.sessionVersion).toBe(1)
    expect(await verifyPassword(changed, dbUser.passwordHash)).toBe(true)
    expect(
      await f.db.authSession.count({
        where: { userId: customer.id, revokedAt: null },
      }),
    ).toBe(0)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: customer.id, action: 'customer.password_changed' },
      }),
    ).toBe(1)

    // Even if a raced pre-change refresh session appears after revocation,
    // its persisted epoch remains 0 and cannot mint a valid new-epoch JWT.
    const racedOldToken = randomBytes(48).toString('base64url')
    await f.db.authSession.create({
      data: {
        userId: customer.id,
        familyId: randomUUID(),
        tokenHash: createHash('sha256').update(racedOldToken).digest('hex'),
        sessionVersion: 0,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    expect(
      (
        await request.post('/v1/auth/refresh', {
          data: { refreshToken: racedOldToken },
        })
      ).status(),
    ).toBe(401)

    // Token from registration and tokens from multiple devices are all fenced.
    for (const oldJwt of [
      customer.token,
      tokens.accessToken,
      otherTokens.accessToken,
    ]) {
      expect(
        (
          await request.get('/v1/auth/me', { headers: bearer(oldJwt) })
        ).status(),
      ).toBe(401)
    }
    for (const oldRefresh of [tokens.refreshToken, otherTokens.refreshToken]) {
      expect(
        (
          await request.post('/v1/auth/refresh', {
            data: { refreshToken: oldRefresh },
          })
        ).status(),
      ).toBe(401)
    }
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: customer.email, password: original },
        })
      ).status(),
    ).toBe(401)
    const newLogin = await request.post('/v1/auth/login', {
      data: { email: customer.email, password: changed },
    })
    expect(newLogin.status()).toBe(200)
    const newTokens = await newLogin.json()
    expect(
      (
        await request.get('/v1/auth/me', {
          headers: bearer(newTokens.accessToken),
        })
      ).status(),
    ).toBe(200)
    const refresh = await request.post('/v1/auth/refresh', {
      data: { refreshToken: newTokens.refreshToken },
    })
    expect(refresh.status()).toBe(200)
    expect(
      (
        await request.get('/v1/auth/me', {
          headers: bearer((await refresh.json()).accessToken),
        })
      ).status(),
    ).toBe(200)
  } finally {
    await f.close()
  }
})

test('05A-4 real DB: concurrent correct password changes permit exactly one write', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const original = `Original-${randomUUID()}-Aa1!`
  try {
    const customer = await f.account('CUSTOMER')
    await f.db.user.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(original) },
    })
    const headers = bearer(customer.token)
    const results = await Promise.all([
      request.post('/v1/auth/change-password', {
        headers,
        data: {
          currentPassword: original,
          newPassword: `First-${randomUUID()}-Aa1!`,
        },
      }),
      request.post('/v1/auth/change-password', {
        headers,
        data: {
          currentPassword: original,
          newPassword: `Second-${randomUUID()}-Aa1!`,
        },
      }),
    ])
    expect(
      results.map((r) => r.status()).filter((status) => status === 200),
    ).toHaveLength(1)
    expect(
      results
        .map((r) => r.status())
        .filter((status) => status === 401 || status === 409),
    ).toHaveLength(1)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: customer.id, action: 'customer.password_changed' },
      }),
    ).toBe(1)
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: customer.id } }))
        .sessionVersion,
    ).toBe(1)
  } finally {
    await f.close()
  }
})
