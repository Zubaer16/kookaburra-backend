import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createHttpApp } from '../src/bootstrap'

describe('Phase 03B API smoke tests (no real database)', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await createHttpApp()
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
  })

  it('serves versioned liveness, with correlation header', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'commerce-api',
      version: '0.2.0',
    })
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('lists Swagger modules in the intended order', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
    expect(
      response.body.tags?.map((tag: { name: string }) => tag.name),
    ).toEqual([
      'System / Health',
      'Authentication / Customer',
      'Authentication / Admin',
      'Catalog / Storefront',
      'Catalog / Admin',
      'Inventory / Admin',
      'Media / Admin',
      'Media / Disk',
      'Cart / Customer',
      'Cart / Guest',
      'Checkout / Customer',
      'Orders / Customer',
      'Orders / Admin',
      'Returns / Customer',
      'Returns / Admin',
      'Payments / Customer',
      'Payments / Admin',
      'Payments / Webhooks',
      'Checkout / Admin',
      'Workspace / Admin',
    ])
  })
  it('publishes Phase 03A catalog routes without requiring a database', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
    for (const path of [
      '/v1/categories',
      '/v1/products',
      '/v1/products/{slug}',
      '/v1/admin/categories',
      '/v1/admin/products',
    ]) {
      expect(response.body.paths).toHaveProperty(path)
    }
  })

  it('publishes all Phase 03B Inventory routes in OpenAPI without a database', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
    const endpoints = [
      ['get', '/v1/admin/inventory'],
      ['get', '/v1/admin/inventory/{id}'],
      ['get', '/v1/admin/inventory/{id}/movements'],
      ['patch', '/v1/admin/inventory/{id}/threshold'],
      ['post', '/v1/admin/inventory/{id}/adjustments'],
    ] as const
    for (const [method, path] of endpoints) {
      const operation = response.body.paths?.[path]?.[method]
      expect(operation).toBeDefined()
      expect(operation.tags).toContain('Inventory / Admin')
      expect(operation.security).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'access-token': [] }),
        ]),
      )
    }
  })

  it('rejects unauthenticated Inventory access before querying a database', async () => {
    const inventoryId = '72e41677-07cc-4e31-b3cb-207d7e2687ca'
    await request(app.getHttpServer()).get('/v1/admin/inventory').expect(401)
    await request(app.getHttpServer())
      .get(`/v1/admin/inventory/${inventoryId}`)
      .expect(401)
    await request(app.getHttpServer())
      .get(`/v1/admin/inventory/${inventoryId}/movements`)
      .expect(401)
    await request(app.getHttpServer())
      .patch(`/v1/admin/inventory/${inventoryId}/threshold`)
      .send({ lowStockThreshold: 5 })
      .expect(401)
    await request(app.getHttpServer())
      .post(`/v1/admin/inventory/${inventoryId}/adjustments`)
      .send({
        requestId: 'bb7a4b48-794c-4118-9350-ad7701d53e15',
        delta: 1,
        reason: 'RECEIPT',
      })
      .expect(401)
  })

  it('guards admin catalog routes before accessing a database', async () => {
    await request(app.getHttpServer()).get('/v1/admin/products').expect(401)
    await request(app.getHttpServer())
      .post('/v1/admin/categories')
      .send({ name: 'Test', slug: 'test' })
      .expect(401)
  })

  it('rejects invalid public catalog query without a database', async () => {
    await request(app.getHttpServer()).get('/v1/products?page=0').expect(400)
  })
  it('allows trusted frontend origins', async () => {
    await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'http://localhost:3001')
      .expect('Access-Control-Allow-Origin', 'http://localhost:3001')
      .expect(200)
  })
  it('rejects untrusted CORS origins', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Origin', 'https://unknown.example')
      .expect(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
  it('protects admin /me without bearer token', async () => {
    await request(app.getHttpServer()).get('/v1/admin/auth/me').expect(401)
  })
  it('rejects invalid customer registration payload before the database', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'invalid', password: 'short' })
      .expect(400)
  })
})

// A1 routes must be both documented and guarded before any DB query.
describe('A1 workspace guards and OpenAPI smoke', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await createHttpApp()
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
  })
  it('documents five role/staff methods with Bearer JWT', async () => {
    const doc = (
      await request(app.getHttpServer()).get('/docs-json').expect(200)
    ).body
    const endpoints = [
      ['get', '/v1/admin/roles'],
      ['patch', '/v1/admin/roles/{key}/permissions'],
      ['get', '/v1/admin/staff'],
      ['post', '/v1/admin/staff'],
      ['patch', '/v1/admin/staff/{id}'],
    ] as const
    for (const [method, path] of endpoints) {
      const operation = doc.paths?.[path]?.[method]
      expect(operation).toBeDefined()
      expect(operation.security).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'access-token': [] }),
        ]),
      )
    }
  })
  it('rejects unauthorized workspace requests without touching database', async () => {
    await request(app.getHttpServer()).get('/v1/admin/roles').expect(401)
    await request(app.getHttpServer()).get('/v1/admin/staff').expect(401)
    await request(app.getHttpServer())
      .post('/v1/admin/staff')
      .send({})
      .expect(401)
    await request(app.getHttpServer())
      .patch('/v1/admin/roles/SUPPORT/permissions')
      .send({ permissions: [] })
      .expect(401)
  })
})
