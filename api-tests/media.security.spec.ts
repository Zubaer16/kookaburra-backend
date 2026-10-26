import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  CatalogTestFixture,
  assertSafeError,
  bearer,
} from './catalog-test-support'
test('03C Media Bearer RBAC, validation and untrusted identifiers', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const id = randomUUID()
    const routes = [
      ['get', `/v1/admin/media/${id}`],
      ['post', '/v1/admin/media/uploads'],
      ['post', `/v1/admin/media/${id}/complete`],
      ['delete', `/v1/admin/media/${id}`],
      ['put', `/v1/admin/products/${id}/media`],
      ['get', '/v1/admin/media-deletion-jobs'],
      ['post', `/v1/admin/media-deletion-jobs/${id}/retry`],
    ] as const
    for (const [method, path] of routes) {
      await assertSafeError(
        await request[method](
          path,
          method === 'get' || method === 'delete' ? {} : { data: {} },
        ),
        401,
      )
    }
    const customer = await f.account('CUSTOMER')
    await assertSafeError(
      await request.post('/v1/admin/media/uploads', {
        headers: bearer(customer.token),
        data: { mimeType: 'image/png', bytes: 200 },
      }),
      403,
    )
    const staff = await f.account('STAFF')
    await assertSafeError(
      await request.post('/v1/admin/media/uploads', {
        headers: bearer(staff.token),
        data: { mimeType: 'image/png', bytes: 200 },
      }),
      403,
    )
    const owner = await f.account('OWNER')
    const headers = bearer(owner.token)
    await assertSafeError(
      await request.post('/v1/admin/media/uploads', {
        headers,
        data: { mimeType: 'image/svg+xml', bytes: 200 },
      }),
      400,
    )
    await assertSafeError(
      await request.post('/v1/admin/media/uploads', {
        headers,
        data: { mimeType: 'image/png', bytes: 10485761 },
      }),
      400,
    )
    await assertSafeError(
      await request.put(`/v1/admin/products/${id}/media`, {
        headers,
        data: { items: [{ mediaId: 'untrusted', position: 0, altText: '' }] },
      }),
      400,
    )
    await assertSafeError(
      await request.get(`/v1/admin/media/${id}`, { headers }),
      404,
    )
    const unavailable = await request.post('/v1/admin/media/uploads', {
      headers,
      data: { mimeType: 'image/png', bytes: 100 },
    })
    expect(unavailable.status()).toBe(503) // test environment has no Cloudinary secrets
  } finally {
    await f.close()
  }
})
