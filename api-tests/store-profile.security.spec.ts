import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

const valid = {
  storeName: 'QA Store',
  supportEmail: 'support@example.com',
  websiteUrl: '',
  timezone: 'UTC',
  supportNotice: '',
}

test('05B-1 security: JWT, OWNER authorization, strict DTO and immutable state on denials', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeProfile.findUnique({
    where: { key: 'primary' },
  })
  try {
    const customer = await f.account('CUSTOMER')
    const staff = await f.account('STAFF')
    const admin = await f.account('ADMIN')
    const owner = await f.account('OWNER')
    for (const account of [customer, staff, admin]) {
      await assertSafeError(
        await request.put('/v1/admin/store/profile', {
          headers: bearer(account.token),
          data: valid,
        }),
        403,
      )
      await assertSafeError(
        await request.get('/v1/admin/store/profile', {
          headers: bearer(account.token),
        }),
        403,
      )
    }
    await assertSafeError(
      await request.put('/v1/admin/store/profile', { data: valid }),
      401,
    )
    for (const bad of [
      { ...valid, orderPrefix: 'ZZ' },
      { ...valid, role: 'OWNER' },
      { ...valid, websiteUrl: 'http://example.com' },
      { ...valid, websiteUrl: 'https://u:p@example.com' },
      { ...valid, websiteUrl: 'https://example.com?token=abc' },
      { ...valid, supportNotice: '<b>bad</b>' },
      { ...valid, storeName: ' ' },
      { ...valid, timezone: 'Bogus/Zone' },
      { ...valid, storeName: '' },
    ]) {
      await assertSafeError(
        await request.put('/v1/admin/store/profile', {
          headers: bearer(owner.token),
          data: bad,
        }),
        400,
      )
    }
    const after = await f.db.storeProfile.findUnique({
      where: { key: 'primary' },
    })
    expect(after).toEqual(previous)
    const audits = await f.db.auditEvent.count({
      where: { actorId: owner.id, action: 'store.profile.updated' },
    })
    expect(audits).toBe(0)
  } finally {
    await f.close()
  }
})
