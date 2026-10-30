import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from '../api-tests/catalog-test-support'
import {
  authorizeInSwagger,
  openSwagger,
  swaggerExecute,
} from './swagger-helper'

test('05B-3 Swagger Chromium: media-backed store branding Try it out Execute', async ({
  page,
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.storeBranding.findUnique({
    where: { key: 'primary' },
  })
  const id = randomUUID()
  try {
    await f.db.mediaAsset.create({
      data: {
        id,
        provider: 'cloudinary',
        namespace: 'projects/kookaburra/products',
        objectKey: `projects/kookaburra/products/fixture-${id}`,
        providerAssetId: `fixture-${id}`,
        mimeType: 'image/png',
        bytes: 100,
        width: 64,
        height: 64,
        publicUrl: `https://cdn.example.test/${id}.png`,
        status: 'ACTIVE',
        uploadExpiresAt: new Date(Date.now() + 3600000),
      },
    })
    const owner = await f.account('OWNER')
    await openSwagger(page)
    await swaggerExecute(page, 'GET', '/v1/admin/store/branding', 401)
    await authorizeInSwagger(page, owner.token)
    const current = await swaggerExecute(
      page,
      'GET',
      '/v1/admin/store/branding',
      200,
    )
    const revision = (await current.json()).revision as number
    await swaggerExecute(page, 'PUT', '/v1/admin/store/branding', 400, {
      expectedRevision: revision,
      logoMediaId: 'https://evil.example/p.png',
      faviconMediaId: null,
    })
    const body = {
      expectedRevision: revision,
      logoMediaId: id,
      faviconMediaId: id,
    }
    const saved = await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/store/branding',
      200,
      body,
    )
    expect((await saved.json()).revision).toBe(revision + 1)
    await swaggerExecute(page, 'PUT', '/v1/admin/store/branding', 409, body)
    const pub = await swaggerExecute(page, 'GET', '/v1/store/branding', 200)
    expect((await pub.json()).logo?.id).toBe(id)
  } finally {
    if (previous)
      await f.db.storeBranding.upsert({
        where: { key: 'primary' },
        create: { ...previous },
        update: { ...previous },
      })
    else await f.db.storeBranding.deleteMany({ where: { key: 'primary' } })
    await f.db.mediaAsset.deleteMany({ where: { id } })
    await f.close()
  }
})
