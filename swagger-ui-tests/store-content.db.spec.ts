import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05B-2 Swagger Chromium: OWNER store content Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeContent.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/store/content', 401)
    await authorizeInSwagger(page, owner.token)
    const current = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/store/content',
      200,
    )
    const revision = (await current.json()).revision as number
    const input = {
      expectedRevision: revision,
      seoTitle: 'Swagger Store',
      seoDescription: 'SEO summary',
      footerText: '',
      privacyPolicy: 'Private',
      termsOfService: 'Terms',
      returnPolicy: 'Returns',
    }
    await swaggerExecute(page, 'PUT', '/v1/admin/store/content', 400, {
      ...input,
      privacyPolicy: '<script>x</script>',
    })
    const saved = await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/store/content',
      200,
      input,
    )
    expect((await saved.json()).revision).toBe(revision + 1)
    await swaggerExecute(page, 'PUT', '/v1/admin/store/content', 409, input)
    const pub = await swaggerExecute(page, 'GET', '/v1/store/content', 200)
    expect((await pub.json()).seoTitle).toBe('Swagger Store')
  } finally {
    if (previous) {
      await f.db.storeContent.upsert({
        where: { key: 'primary' },
        create: { ...previous },
        update: { ...previous },
      })
    } else {
      await f.db.storeContent.deleteMany({ where: { key: 'primary' } })
    }
    await f.close()
  }
})
