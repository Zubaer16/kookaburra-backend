import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05B-1 Swagger Chromium: OWNER store identity Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeProfile.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/store/profile', 401)
    await authorizeInSwagger(page, owner.token)
    await swaggerExecute(page, 'PUT', '/v1/admin/store/profile', 400, {
      storeName: 'Demo',
      supportEmail: 'support@example.com',
      websiteUrl: 'http://insecure.example.com',
      timezone: 'UTC',
      supportNotice: '',
    })
    const saved = await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/store/profile',
      200,
      {
        storeName: 'Swagger QA Shop',
        supportEmail: 'qa@example.com',
        websiteUrl: '',
        timezone: 'UTC',
        supportNotice: 'Support is available.',
      },
    )
    expect((await saved.json()).storeName).toBe('Swagger QA Shop')
    const pub = await swaggerExecute(page, 'GET', '/v1/store/profile', 200)
    expect((await pub.json()).supportEmail).toBe('qa@example.com')
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
      await f.db.storeProfile.deleteMany({ where: { key: 'primary' } })
    }
    await f.close()
  }
})
