import { expect, test, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import {
  CatalogTestFixture,
  assertSafeError,
  bearer,
} from './catalog-test-support'

/** Phase 03A dedicated regression security tests against REAL HTTP and
 * isolated local PostgreSQL. Added alongside, not instead of, Auth tests.
 */
async function invoke(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  headers?: Record<string, string>,
  data?: object | string,
) {
  return request.fetch(path, {
    method,
    headers,
    ...(data === undefined ? {} : { data }),
  })
}

test.describe('Phase 03A Catalog negative/security — isolated PostgreSQL', () => {
  test('Every Admin Catalog route denies missing/invalid bearer credentials', async ({
    request,
  }) => {
    const id = randomUUID()
    const routes: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string]> = [
      ['GET', '/v1/admin/categories'],
      ['POST', '/v1/admin/categories'],
      ['PATCH', `/v1/admin/categories/${id}`],
      ['DELETE', `/v1/admin/categories/${id}`],
      ['GET', '/v1/admin/products'],
      ['GET', `/v1/admin/products/${id}`],
      ['POST', '/v1/admin/products'],
      ['PATCH', `/v1/admin/products/${id}`],
      ['DELETE', `/v1/admin/products/${id}`],
      ['POST', `/v1/admin/products/${id}/variants`],
      ['PATCH', `/v1/admin/products/${id}/variants/${id}`],
      ['DELETE', `/v1/admin/products/${id}/variants/${id}`],
    ]
    for (const [method, path] of routes) {
      await assertSafeError(await invoke(request, method, path), 401)
      await assertSafeError(
        await invoke(request, method, path, bearer('invalid.jwt.token')),
        401,
      )
    }
  })

  test('Expired signed access tokens cannot read or change Catalog', async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    try {
      const owner = await f.account('OWNER')
      const secret = process.env.JWT_ACCESS_SECRET
      if (!secret || secret.length < 32)
        throw new Error('Missing isolated test JWT secret')
      const expired = await new JwtService().signAsync(
        { sub: owner.id, typ: 'access', role: 'OWNER' },
        {
          secret,
          algorithm: 'HS256',
          issuer: 'commerce-api',
          audience: 'commerce-clients',
          expiresIn: -30,
        },
      )
      await assertSafeError(
        await request.get('/v1/admin/products', { headers: bearer(expired) }),
        401,
      )
      await assertSafeError(
        await request.post('/v1/admin/categories', {
          headers: bearer(expired),
          data: { name: 'Blocked', slug: f.slug('blocked') },
        }),
        401,
      )
      expect(
        await f.db.category.count({ where: { slug: f.slug('blocked') } }),
      ).toBe(0)
    } finally {
      await f.close()
    }
  })

  test('CUSTOMER cannot read/write Admin; STAFF can read but cannot write any Catalog route', async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    try {
      const customer = await f.account('CUSTOMER')
      const staff = await f.account('STAFF')
      const id = randomUUID()
      for (const path of [
        '/v1/admin/categories',
        '/v1/admin/products',
        `/v1/admin/products/${id}`,
      ]) {
        await assertSafeError(
          await request.get(path, { headers: bearer(customer.token) }),
          403,
        )
      }
      for (const path of ['/v1/admin/categories', '/v1/admin/products']) {
        expect(
          (await request.get(path, { headers: bearer(staff.token) })).status(),
        ).toBe(200)
      }
      const writes: Array<['POST' | 'PATCH' | 'DELETE', string]> = [
        ['POST', '/v1/admin/categories'],
        ['PATCH', `/v1/admin/categories/${id}`],
        ['DELETE', `/v1/admin/categories/${id}`],
        ['POST', '/v1/admin/products'],
        ['PATCH', `/v1/admin/products/${id}`],
        ['DELETE', `/v1/admin/products/${id}`],
        ['POST', `/v1/admin/products/${id}/variants`],
        ['PATCH', `/v1/admin/products/${id}/variants/${id}`],
        ['DELETE', `/v1/admin/products/${id}/variants/${id}`],
      ]
      for (const [method, path] of writes) {
        await assertSafeError(
          await invoke(request, method, path, bearer(staff.token), {}),
          403,
        )
      }
      expect(
        await f.db.category.count({
          where: { slug: { startsWith: f.slug('') } },
        }),
      ).toBe(0)
    } finally {
      await f.close()
    }
  })

  test('DTO rejection, mass assignment, boundaries and malformed JSON never persist rejected products', async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    try {
      const owner = await f.account('OWNER')
      const auth = bearer(owner.token)
      const category = await request.post('/v1/admin/categories', {
        headers: auth,
        data: { name: 'Security category', slug: f.slug('category') },
      })
      expect(category.status()).toBe(201)
      const categoryId = ((await category.json()) as { id: string }).id
      const base = {
        title: 'Security product',
        slug: f.slug('product'),
        sku: f.sku('product'),
        priceMinor: 100,
        categoryIds: [categoryId],
      }
      const invalid = [
        { ...base, title: '' },
        { ...base, title: 'x'.repeat(251) },
        { ...base, priceMinor: -1 },
        { ...base, priceMinor: 1.4 },
        { ...base, priceMinor: 2147483648 },
        { ...base, sku: 'x'.repeat(121) },
        { ...base, categoryIds: [] },
        { ...base, categoryIds: ['not-a-uuid'] },
        { ...base, categoryIds: [randomUUID()] },
        { ...base, currency: 'usd' },
        { ...base, status: 'OWNER' },
        { ...base, role: 'OWNER' },
        { ...base, compareAtMinor: 100 },
        { ...base, stockOnHand: -1 },
        {
          ...base,
          variants: [{ sku: f.sku('invalid'), options: {}, stockOnHand: 0 }],
        },
        {
          ...base,
          variants: [
            { sku: f.sku('valid'), options: { color: 'Blue' }, stockOnHand: 1 },
          ],
          stockOnHand: 1,
        },
      ]
      for (const data of invalid) {
        const result = await request.post('/v1/admin/products', {
          headers: auth,
          data,
        })
        await assertSafeError(result, 400)
      }
      await assertSafeError(
        await request.post('/v1/admin/products', {
          headers: { ...auth, 'Content-Type': 'application/json' },
          data: '{not-json',
        }),
        400,
      )
      await assertSafeError(
        await request.get('/v1/products?page=0&limit=101'),
        400,
      )
      await assertSafeError(
        await request.get('/v1/admin/products?status=INVALID', {
          headers: auth,
        }),
        400,
      )
      await assertSafeError(
        await request.patch(`/v1/admin/categories/${randomUUID()}`, {
          headers: auth,
          data: { parentId: 'not-a-uuid' },
        }),
        400,
      )
      expect(await f.db.product.count({ where: { slug: base.slug } })).toBe(0)
      expect(
        await f.db.auditEvent.count({
          where: { actorId: owner.id, action: 'product.created' },
        }),
      ).toBe(0)
    } finally {
      await f.close()
    }
  })

  test('Duplicate SKU/slug, variant combinations and invalid category cycles roll back safely', async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    try {
      const owner = await f.account('OWNER')
      const auth = bearer(owner.token)
      const makeCategory = async (slug: string, parentId?: string) => {
        const response = await request.post('/v1/admin/categories', {
          headers: auth,
          data: {
            name: slug,
            slug: f.slug(slug),
            ...(parentId ? { parentId } : {}),
          },
        })
        expect(response.status()).toBe(201)
        return ((await response.json()) as { id: string }).id
      }
      const root = await makeCategory('root')
      const child = await makeCategory('child', root)
      await assertSafeError(
        await request.patch(`/v1/admin/categories/${root}`, {
          headers: auth,
          data: { parentId: child },
        }),
        409,
      )
      expect(
        (await f.db.category.findUnique({ where: { id: root } }))?.parentId,
      ).toBeNull()
      await assertSafeError(
        await request.delete(`/v1/admin/categories/${root}`, { headers: auth }),
        409,
      )
      const payload = {
        title: 'Original',
        slug: f.slug('product'),
        sku: f.sku('product'),
        priceMinor: 100,
        categoryIds: [child],
      }
      const result = await request.post('/v1/admin/products', {
        headers: auth,
        data: payload,
      })
      expect(result.status()).toBe(201)
      const id = ((await result.json()) as { id: string }).id
      await assertSafeError(
        await request.post('/v1/admin/products', {
          headers: auth,
          data: { ...payload, slug: f.slug('second') },
        }),
        409,
      )
      await assertSafeError(
        await request.post('/v1/admin/products', {
          headers: auth,
          data: { ...payload, sku: f.sku('second') },
        }),
        409,
      )
      const firstVariant = await request.post(
        `/v1/admin/products/${id}/variants`,
        {
          headers: auth,
          data: {
            sku: f.sku('blue'),
            options: { color: 'Blue' },
            stockOnHand: 0,
          },
        },
      )
      expect(firstVariant.status()).toBe(201)
      const variantId = ((await firstVariant.json()) as { id: string }).id
      await assertSafeError(
        await request.post(`/v1/admin/products/${id}/variants`, {
          headers: auth,
          data: {
            sku: f.sku('new'),
            options: { color: 'blue' },
            stockOnHand: 0,
          },
        }),
        409,
      )
      await assertSafeError(
        await request.patch(`/v1/admin/products/${id}`, {
          headers: auth,
          data: { variants: [] },
        }),
        400,
      )
      const published = await request.patch(`/v1/admin/products/${id}`, {
        headers: auth,
        data: { status: 'ACTIVE' },
      })
      expect(published.status()).toBe(200)
      await assertSafeError(
        await request.delete(`/v1/admin/products/${id}/variants/${variantId}`, {
          headers: auth,
        }),
        409,
      )
      expect(await f.db.product.count({ where: { slug: payload.slug } })).toBe(
        1,
      )
      expect(
        await f.db.productVariant.count({ where: { productId: id } }),
      ).toBe(1)
    } finally {
      await f.close()
    }
  })
})
