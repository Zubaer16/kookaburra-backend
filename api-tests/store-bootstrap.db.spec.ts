import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from './catalog-test-support'

test('05B-4 PostgreSQL: bootstrap reflects current authoritative public projections, never admin fields', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const beforeProfile = await f.db.storeProfile.findUnique({
    where: { key: 'primary' },
  })
  const beforeContent = await f.db.storeContent.findUnique({
    where: { key: 'primary' },
  })
  const marker = `Shop-${randomUUID().slice(0, 8)}`
  try {
    await f.db.storeProfile.upsert({
      where: { key: 'primary' },
      create: {
        key: 'primary',
        storeName: marker,
        supportEmail: 'help@example.test',
        websiteUrl: '',
        timezone: 'UTC',
        supportNotice: '',
      },
      update: {
        storeName: marker,
        supportEmail: 'help@example.test',
        websiteUrl: '',
        timezone: 'UTC',
        supportNotice: '',
      },
    })
    await f.db.storeContent.upsert({
      where: { key: 'primary' },
      create: {
        key: 'primary',
        revision: 1,
        seoTitle: marker,
        seoDescription: '',
        footerText: '',
        privacyPolicy: '',
        termsOfService: '',
        returnPolicy: '',
      },
      update: {
        seoTitle: marker,
        seoDescription: '',
        footerText: '',
        privacyPolicy: '',
        termsOfService: '',
        returnPolicy: '',
      },
    })
    const res = await request.get('/v1/store/bootstrap')
    expect(res.status()).toBe(200)
    const bootstrap = await res.json()
    expect(bootstrap.profile.storeName).toBe(marker)
    expect(bootstrap.content.seoTitle).toBe(marker)
    const [profile, content, branding] = await Promise.all([
      request.get('/v1/store/profile'),
      request.get('/v1/store/content'),
      request.get('/v1/store/branding'),
    ])
    expect(bootstrap.profile).toEqual(await profile.json())
    expect(bootstrap.content).toEqual(await content.json())
    expect(bootstrap.branding).toEqual(await branding.json())
    expect(bootstrap.profile).not.toHaveProperty('updatedAt')
    expect(bootstrap.content).not.toHaveProperty('revision')
    expect(bootstrap.branding).not.toHaveProperty('revision')
  } finally {
    if (beforeProfile)
      await f.db.storeProfile.upsert({
        where: { key: 'primary' },
        create: { ...beforeProfile },
        update: { ...beforeProfile },
      })
    else await f.db.storeProfile.deleteMany({ where: { key: 'primary' } })
    if (beforeContent)
      await f.db.storeContent.upsert({
        where: { key: 'primary' },
        create: { ...beforeContent },
        update: { ...beforeContent },
      })
    else await f.db.storeContent.deleteMany({ where: { key: 'primary' } })
    await f.close()
  }
})
