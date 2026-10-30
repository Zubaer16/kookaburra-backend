import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

const valid = {
  expectedRevision: 0,
  seoTitle: 'Good',
  seoDescription: '',
  footerText: '',
  privacyPolicy: '',
  termsOfService: '',
  returnPolicy: '',
}

test('05B-2 security: deny non-owner, HTML, mass assignment and invalid revision without mutation', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeContent.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    for (const role of ['CUSTOMER', 'STAFF', 'ADMIN'] as const) {
      const account = await f.account(role)
      await assertSafeError(
        await request.put('/v1/admin/store/content', {
          headers: bearer(account.token),
          data: valid,
        }),
        403,
      )
      await assertSafeError(
        await request.get('/v1/admin/store/content', {
          headers: bearer(account.token),
        }),
        403,
      )
    }
    await assertSafeError(
      await request.put('/v1/admin/store/content', { data: valid }),
      401,
    )
    for (const bad of [
      { ...valid, role: 'OWNER' },
      { ...valid, logoUrl: 'https://evil.example' },
      { ...valid, expectedRevision: -1 },
      { ...valid, expectedRevision: '0' },
      { ...valid, footerText: '<img src=x onerror=alert(1)>' },
      { ...valid, privacyPolicy: '<b>Policy</b>' },
      { ...valid, returnPolicy: 'a'.repeat(10001) },
    ]) {
      await assertSafeError(
        await request.put('/v1/admin/store/content', {
          headers: bearer(owner.token),
          data: bad,
        }),
        400,
      )
    }
    expect(
      await f.db.storeContent.findUnique({ where: { key: 'primary' } }),
    ).toEqual(previous)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: owner.id, action: 'store.content.updated' },
      }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
