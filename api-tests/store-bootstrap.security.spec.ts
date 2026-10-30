import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test('05B-4 security: anonymous projection, method surface locked, admin contracts remain protected', async ({
  request,
}) => {
  const pub = await request.get('/v1/store/bootstrap', {
    headers: { Authorization: 'Bearer malformed' },
  })
  expect(pub.status()).toBe(200)
  const output = await pub.json()
  expect(JSON.stringify(output)).not.toMatch(
    /providerAssetId|objectKey|actorId|revision|updatedAt|refreshToken|passwordHash/,
  )
  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    await assertSafeError(
      await request[method]('/v1/store/bootstrap', {
        data: { isOwner: true, secret: 'leak?' },
      }),
      404,
    )
  }
  const f = new CatalogTestFixture(request)
  try {
    const customer = await f.account('CUSTOMER')
    for (const path of [
      '/v1/admin/store/profile',
      '/v1/admin/store/content',
      '/v1/admin/store/branding',
    ]) {
      await assertSafeError(await request.get(path), 401)
      await assertSafeError(
        await request.get(path, { headers: bearer(customer.token) }),
        403,
      )
    }
  } finally {
    await f.close()
  }
})
