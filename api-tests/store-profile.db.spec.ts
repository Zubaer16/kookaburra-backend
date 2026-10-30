import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const profile = {
  storeName: '  QA Independent Shop  ',
  supportEmail: 'Support@Example.com',
  websiteUrl: 'https://shop.example.com',
  timezone: 'Asia/Singapore',
  supportNotice: 'Contact support for order questions.',
}

test('05B-1 real PostgreSQL: persisted OWNER profile, public projection, audit and preservation', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  // This test changes one isolated configuration record. Restore exactly the
  // previous value, even if an assertion fails. No global DB reset.
  const previous = await f.db.storeProfile.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const saved = await request.put('/v1/admin/store/profile', {
      headers: bearer(owner.token),
      data: profile,
    })
    expect(saved.status()).toBe(200)
    expect(await saved.json()).toMatchObject({
      configured: true,
      storeName: 'QA Independent Shop',
      supportEmail: 'support@example.com',
      websiteUrl: 'https://shop.example.com',
      timezone: 'Asia/Singapore',
      supportNotice: profile.supportNotice,
    })
    const stored = await f.db.storeProfile.findUnique({
      where: { key: 'primary' },
    })
    expect(stored?.storeName).toBe('QA Independent Shop')
    expect(stored?.supportEmail).toBe('support@example.com')
    expect(stored?.createdAt).toBeDefined()
    const audit = await f.db.auditEvent.findFirst({
      where: { actorId: owner.id, action: 'store.profile.updated' },
    })
    expect(audit).toMatchObject({
      targetType: 'store_profile',
      targetId: 'primary',
    })
    const publicRes = await request.get('/v1/store/profile')
    expect(publicRes.status()).toBe(200)
    const publicData = await publicRes.json()
    expect(publicData).not.toHaveProperty('updatedAt')
    expect(publicData).not.toHaveProperty('key')
    expect(publicData).not.toHaveProperty('orderPrefix')
    expect(publicData).not.toHaveProperty('actorId')
    expect(publicData.storeName).toBe('QA Independent Shop')
    const customerRead = await request.get('/v1/admin/store/profile', {
      headers: bearer(customer.token),
    })
    expect(customerRead.status()).toBe(403)
    const ownerRead = await request.get('/v1/admin/store/profile', {
      headers: bearer(owner.token),
    })
    expect(ownerRead.status()).toBe(200)
    expect((await ownerRead.json()).updatedAt).toBeDefined()
  } finally {
    if (previous) {
      await f.db.storeProfile.upsert({
        where: { key: 'primary' },
        create: {
          key: previous.key,
          createdAt: previous.createdAt,
          updatedAt: previous.updatedAt,
          storeName: previous.storeName,
          supportEmail: previous.supportEmail,
          websiteUrl: previous.websiteUrl,
          timezone: previous.timezone,
          supportNotice: previous.supportNotice,
        },
        update: {
          createdAt: previous.createdAt,
          updatedAt: previous.updatedAt,
          storeName: previous.storeName,
          supportEmail: previous.supportEmail,
          websiteUrl: previous.websiteUrl,
          timezone: previous.timezone,
          supportNotice: previous.supportNotice,
        },
      })
    } else {
      // Only delete this test-created singleton in the protected local test DB.
      await f.db.storeProfile.deleteMany({ where: { key: 'primary' } })
    }
    await f.close()
  }
})
