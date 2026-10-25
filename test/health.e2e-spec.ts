import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createHttpApp } from '../src/bootstrap'

describe('Phase 03A API smoke tests (no real database)', () => {
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
