import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test('05B-3 security: no anonymous/non-owner mutations, raw URLs, forged fields or unverified assets', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeBranding.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    const valid = {
      expectedRevision: previous?.revision ?? 0,
      logoMediaId: null,
      faviconMediaId: null,
    }
    await assertSafeError(
      await request.put('/v1/admin/store/branding', { data: valid }),
      401,
    )
    for (const role of ['CUSTOMER', 'STAFF', 'ADMIN'] as const) {
      const user = await f.account(role)
      await assertSafeError(
        await request.put('/v1/admin/store/branding', {
          headers: bearer(user.token),
          data: valid,
        }),
        403,
      )
      await assertSafeError(
        await request.get('/v1/admin/store/branding', {
          headers: bearer(user.token),
        }),
        403,
      )
    }
    for (const bad of [
      { ...valid, logoUrl: 'https://untrusted.example/foo' },
      { ...valid, providerAssetId: 'anything' },
      { ...valid, expectedRevision: '0' },
      { ...valid, logoMediaId: 'not-an-id' },
      { ...valid, faviconMediaId: 'https://example.test/icon.png' },
      { ...valid, role: 'OWNER' },
    ])
      await assertSafeError(
        await request.put('/v1/admin/store/branding', {
          headers: bearer(owner.token),
          data: bad,
        }),
        400,
      )
    await assertSafeError(
      await request.put('/v1/admin/store/branding', {
        headers: bearer(owner.token),
        data: { ...valid, logoMediaId: randomUUID() },
      }),
      409,
    )
    expect(
      await f.db.storeBranding.findUnique({ where: { key: 'primary' } }),
    ).toEqual(previous)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: owner.id, action: 'store.branding.updated' },
      }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
