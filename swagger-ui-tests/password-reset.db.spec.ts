import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  decryptEmailActionToken,
  type EncryptedActionToken,
} from '../src/auth/email-verification.crypto'
import { openSwagger, swaggerExecute } from './swagger-helper'

test('05A-6 Swagger Chromium: password recovery request/confirm Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  let userId = ''
  try {
    const customer = await f.account('CUSTOMER')
    userId = customer.id
    await openSwagger(page)
    const accepted = await swaggerExecute(
      page,
      'POST',
      '/v1/auth/password-reset/request',
      202,
      { email: customer.email },
    )
    expect(await accepted.json()).toEqual({ accepted: true })
    const event = await f.db.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'auth.password_reset.requested',
        payload: { path: ['userId'], equals: userId },
      },
    })
    const payload = event.payload as unknown as {
      eventId: string
      token: EncryptedActionToken
    }
    const token = decryptEmailActionToken(
      process.env.AUTH_ACTION_TOKEN_ENCRYPTION_KEY!,
      payload.token,
      `${userId}:${payload.eventId}`,
    )
    const completed = await swaggerExecute(
      page,
      'POST',
      '/v1/auth/password-reset/confirm',
      200,
      { token, newPassword: 'Recovered-password-98765!' },
    )
    expect(await completed.json()).toEqual({
      changed: true,
      sessionsRevoked: true,
    })
    await swaggerExecute(page, 'POST', '/v1/auth/password-reset/confirm', 400, {
      token,
      newPassword: 'Another-password-12345!',
    })
  } finally {
    if (userId)
      await f.db.outboxEvent.deleteMany({
        where: {
          eventType: 'auth.password_reset.requested',
          payload: { path: ['userId'], equals: userId },
        },
      })
    await f.close()
  }
})
