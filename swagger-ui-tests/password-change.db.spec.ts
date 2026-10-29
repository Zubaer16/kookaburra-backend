import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import { hashPassword } from '../src/auth/password'
import {
  openSwagger,
  authorizeInSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05A-4 Swagger Chromium: customer password change Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const currentPassword = `Current-${randomUUID()}-Aa1!`
  const newPassword = `Updated-${randomUUID()}-Aa1!`
  try {
    const customer = await f.account('CUSTOMER')
    await f.db.user.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(currentPassword) },
    })
    await openSwagger(page)
    await swaggerExecute(page, 'POST', '/v1/auth/change-password', 401, {
      currentPassword,
      newPassword,
    })
    await authorizeInSwagger(page, customer.token)
    const response = await swaggerExecute(
      page,
      'POST',
      '/v1/auth/change-password',
      200,
      { currentPassword, newPassword },
    )
    expect((await response.json()).changed).toBe(true)
    await swaggerExecute(page, 'POST', '/v1/auth/change-password', 401, {
      currentPassword,
      newPassword,
    })
    expect(
      (
        await request.post('/v1/auth/login', {
          data: { email: customer.email, password: newPassword },
        })
      ).status(),
    ).toBe(200)
  } finally {
    await f.close()
  }
})
