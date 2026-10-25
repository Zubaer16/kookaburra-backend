import { test } from '@playwright/test'
import { openSwagger, swaggerExecute } from './swagger-helper'

// Safe visual smoke run: no database writes, no authentication credentials.
test('Watch Swagger execute health and protected endpoints safely', async ({
  page,
}) => {
  await openSwagger(page)
  await test.step('Health: 200 OK', async () => {
    await swaggerExecute(page, 'GET', '/v1/health', 200)
  })
  await test.step('Customer protected profile without token: 401', async () => {
    await swaggerExecute(page, 'GET', '/v1/auth/me', 401)
  })
  await test.step('Admin protected profile without token: 401', async () => {
    await swaggerExecute(page, 'GET', '/v1/admin/auth/me', 401)
  })
  await test.step('Public Catalog query rejects an invalid page in Swagger: 400', async () => {
    await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      400,
      undefined,
      {},
      { page: 0 },
    )
  })
  await test.step('Admin Catalog read without token: 401', async () => {
    await swaggerExecute(page, 'GET', '/v1/admin/products', 401)
  })
  await test.step('Admin Catalog write without token: 401', async () => {
    await swaggerExecute(page, 'POST', '/v1/admin/categories', 401, {
      name: 'Blocked',
      slug: 'blocked-test',
    })
  })
  await test.step('Invalid customer registration is rejected before database: 400', async () => {
    await swaggerExecute(page, 'POST', '/v1/auth/register', 400, {
      email: 'invalid-address',
      password: 'too-short',
    })
  })
})
