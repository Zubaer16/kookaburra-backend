import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05A-2 Swagger Chromium: customer account profile and address Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const user = await f.account('CUSTOMER')
    await openSwagger(page)
    await authorizeInSwagger(page, user.token)
    const profile = await swaggerExecute(
      page,
      'GET',
      '/v1/account/profile',
      200,
    )
    expect((await profile.json()).email).toBe(user.email)
    await swaggerExecute(page, 'PATCH', '/v1/account/profile', 400, {
      displayName: '  ',
      role: 'OWNER',
    })
    const saved = await swaggerExecute(
      page,
      'POST',
      '/v1/account/addresses',
      201,
      {
        recipientName: 'Customer Test',
        phone: '+12025550123',
        addressLine1: '3 Example Road',
        city: 'Dhaka',
        countryCode: 'BD',
      },
    )
    expect((await saved.json()).isDefault).toBe(true)
    const list = await swaggerExecute(page, 'GET', '/v1/account/addresses', 200)
    expect((await list.json()).count).toBe(1)
  } finally {
    await f.close()
  }
})
