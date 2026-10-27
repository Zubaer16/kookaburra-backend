import { expect, test } from '@playwright/test'

/** Safe/read-only API smoke tests: no database credentials or writes. */
test.describe('System & OpenAPI', () => {
  test('Health returns HTTP 200, version and correlation ID', async ({
    request,
  }) => {
    const res = await request.get('/v1/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({
      status: 'ok',
      service: 'commerce-api',
      version: '0.2.0',
    })
    expect(res.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('Swagger publishes implemented endpoints with stable module order', async ({
    request,
  }) => {
    const res = await request.get('/docs-json')
    expect(res.status()).toBe(200)
    const doc = await res.json()
    expect(doc.tags.map((tag: { name: string }) => tag.name)).toEqual([
      'System / Health',
      'Authentication / Customer',
      'Authentication / Admin',
      'Catalog / Storefront',
      'Catalog / Admin',
      'Inventory / Admin',
      'Media / Admin',
      'Media / Disk',
      'Cart / Customer',
      'Workspace / Admin',
    ])
    for (const endpoint of [
      '/v1/health',
      '/v1/auth/register',
      '/v1/auth/login',
      '/v1/auth/refresh',
      '/v1/auth/logout',
      '/v1/auth/me',
      '/v1/admin/auth/login',
      '/v1/admin/auth/me',
      '/v1/categories',
      '/v1/products',
      '/v1/products/{slug}',
      '/v1/admin/categories',
      '/v1/admin/products',
      '/v1/admin/inventory',
      '/v1/admin/inventory/{id}',
      '/v1/admin/inventory/{id}/movements',
      '/v1/admin/inventory/{id}/threshold',
      '/v1/admin/inventory/{id}/adjustments',
      '/v1/admin/roles',
      '/v1/admin/roles/{key}/permissions',
      '/v1/admin/staff',
      '/v1/admin/staff/{id}',
    ]) {
      expect(doc.paths, `Missing OpenAPI path ${endpoint}`).toHaveProperty(
        endpoint,
      )
    }
  })

  test('invalid catalog query is rejected before accessing a database', async ({
    request,
  }) => {
    const res = await request.get('/v1/products?page=0')
    expect(res.status()).toBe(400)
  })

  test('admin catalog routes are protected without a bearer token', async ({
    request,
  }) => {
    expect((await request.get('/v1/admin/products')).status()).toBe(401)
    const write = await request.post('/v1/admin/categories', {
      data: { name: 'Test', slug: 'test' },
    })
    expect(write.status()).toBe(401)
  })

  test('admin Inventory routes reject missing bearer tokens', async ({
    request,
  }) => {
    const id = '72e41677-07cc-4e31-b3cb-207d7e2687ca'
    for (const endpoint of [
      '/v1/admin/inventory',
      `/v1/admin/inventory/${id}`,
      `/v1/admin/inventory/${id}/movements`,
    ]) {
      expect((await request.get(endpoint)).status()).toBe(401)
    }
    expect(
      (
        await request.patch(`/v1/admin/inventory/${id}/threshold`, {
          data: { lowStockThreshold: 5 },
        })
      ).status(),
    ).toBe(401)
    expect(
      (
        await request.post(`/v1/admin/inventory/${id}/adjustments`, {
          data: {
            requestId: 'bb7a4b48-794c-4118-9350-ad7701d53e15',
            delta: 1,
            reason: 'RECEIPT',
          },
        })
      ).status(),
    ).toBe(401)
  })

  test('trusted localhost origin is allowed', async ({ request }) => {
    const res = await request.get('/v1/health', {
      headers: { Origin: 'http://localhost:3001' },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['access-control-allow-origin']).toBe(
      'http://localhost:3001',
    )
  })

  test('untrusted origin is not granted CORS', async ({ request }) => {
    const res = await request.get('/v1/health', {
      headers: { Origin: 'https://untrusted.example' },
    })
    expect(res.status()).toBe(200)
    expect(res.headers()['access-control-allow-origin']).toBeUndefined()
  })
})

test.describe('Authentication validation and protection', () => {
  test('customer registration rejects invalid credentials', async ({
    request,
  }) => {
    const res = await request.post('/v1/auth/register', {
      data: { email: 'not-an-email', password: 'short' },
    })
    expect(res.status()).toBe(400)
  })

  test('customer registration rejects unknown fields', async ({ request }) => {
    const res = await request.post('/v1/auth/register', {
      data: {
        email: 'demo@example.test',
        password: 'ValidTestingPass123!',
        role: 'OWNER',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('login rejects malformed payload before DB', async ({ request }) => {
    for (const endpoint of ['/v1/auth/login', '/v1/admin/auth/login']) {
      const res = await request.post(endpoint, {
        data: { email: 'bad', password: 'short' },
      })
      expect(res.status()).toBe(400)
    }
  })

  test('refresh and logout reject bad tokens', async ({ request }) => {
    for (const endpoint of ['/v1/auth/refresh', '/v1/auth/logout']) {
      const res = await request.post(endpoint, {
        data: { refreshToken: 'short' },
      })
      expect(res.status()).toBe(400)
    }
  })

  test('customer and admin protected profiles require bearer token', async ({
    request,
  }) => {
    for (const endpoint of ['/v1/auth/me', '/v1/admin/auth/me']) {
      const res = await request.get(endpoint)
      expect(res.status()).toBe(401)
    }
  })
})
