import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('05A-5 security: no unauthenticated/staff issuance, no token in response, invalid payload rejected', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let customerId = ''
  try {
    const customer = await f.account('CUSTOMER')
    customerId = customer.id
    const admin = await f.account('OWNER')
    const path = '/v1/auth/email-verification/request'
    expect((await request.post(path)).status()).toBe(401)
    expect(
      (await request.post(path, { headers: bearer(admin.token) })).status(),
    ).toBe(401)
    const res = await request.post(path, { headers: bearer(customer.token) })
    expect(res.status()).toBe(202)
    expect(await res.json()).toEqual({ accepted: true })
    expect(JSON.stringify(await res.json())).not.toMatch(
      /token|email|password/i,
    )
    for (const bad of [
      { token: 'short' },
      { token: randomBytes(48).toString('base64url'), role: 'OWNER' },
      {},
    ]) {
      expect(
        (
          await request.post('/v1/auth/email-verification/confirm', {
            data: bad,
          })
        ).status(),
      ).toBe(400)
    }
    expect(
      (
        await request.post('/v1/auth/email-verification/confirm', {
          data: { token: randomBytes(48).toString('base64url') },
        })
      ).status(),
    ).toBe(400)
    expect(
      (await f.db.user.findUniqueOrThrow({ where: { id: customerId } }))
        .emailVerifiedAt,
    ).toBeNull()
  } finally {
    if (customerId)
      await f.db.outboxEvent.deleteMany({
        where: {
          eventType: 'auth.email_verification.requested',
          payload: { path: ['userId'], equals: customerId },
        },
      })
    await f.close()
  }
})
