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
  await test.step('A2 inverted public price range is rejected before DB access', async () => {
    await swaggerExecute(
      page,
      'GET',
      '/v1/products',
      400,
      undefined,
      {},
      {
        minPriceMinor: 3000,
        maxPriceMinor: 1000,
      },
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
  await test.step('Admin Inventory read without token: 401', async () => {
    await swaggerExecute(page, 'GET', '/v1/admin/inventory', 401)
  })
  await test.step('Inventory lowStock dropdown accepts true and false without DB writes', async () => {
    // Both enum values are selected via Swagger's real HTML <select>.
    // The HTTP 401 is expected because this smoke suite has no credentials.
    for (const lowStock of ['true', 'false']) {
      await swaggerExecute(
        page,
        'GET',
        '/v1/admin/inventory',
        401,
        undefined,
        {},
        { lowStock },
      )
    }
  })
  await test.step('Admin Inventory write without token: 401', async () => {
    await swaggerExecute(
      page,
      'POST',
      '/v1/admin/inventory/{id}/adjustments',
      401,
      {
        requestId: 'bb7a4b48-794c-4118-9350-ad7701d53e15',
        delta: 1,
        reason: 'RECEIPT',
      },
      { id: '72e41677-07cc-4e31-b3cb-207d7e2687ca' },
    )
  })
  await test.step('Workspace roles without JWT: 401', async () => {
    await swaggerExecute(page, 'GET', '/v1/admin/roles', 401)
  })
  await test.step('Workspace staff create without JWT: 401', async () => {
    await swaggerExecute(page, 'POST', '/v1/admin/staff', 401, {
      name: 'Blocked',
      email: 'blocked@example.test',
      password: 'InvalidNoAuth123!',
      role: 'ANALYST',
    })
  })
  await test.step('Invalid customer registration is rejected before database: 400', async () => {
    await swaggerExecute(page, 'POST', '/v1/auth/register', 400, {
      email: 'invalid-address',
      password: 'too-short',
    })
  })
})
