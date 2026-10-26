import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from '../api-tests/catalog-test-support'
import {
  openSwagger,
  authorizeInSwagger,
  swaggerExecute,
} from './swagger-helper'

test('03C Swagger Chromium: JWT, gallery changes, shared asset rejection and DB cleanup', async ({
  page,
  request,
}) => {
  test.setTimeout(240000)
  const f = new CatalogTestFixture(request)
  const mediaId = randomUUID()
  try {
    const owner = await f.account('OWNER')
    await openSwagger(page)
    // New VPS delivery endpoint must not reveal unattached/nonexistent media.
    await swaggerExecute(page, 'GET', '/v1/media/files/{id}', 404, undefined, {
      id: mediaId,
    })
    await swaggerExecute(page, 'GET', '/v1/admin/media/{id}', 401, undefined, {
      id: mediaId,
    })
    await authorizeInSwagger(page, owner.token)
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: '03C', slug: f.slug('cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Media Shirt',
        slug: f.slug('shirt'),
        sku: f.sku('shirt'),
        priceMinor: 1100,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const id = (await product.json()).id as string
    const namespace = 'projects/kookaburra/products'
    await f.db.mediaAsset.create({
      data: {
        id: mediaId,
        provider: 'cloudinary',
        namespace,
        objectKey: `${namespace}/fixture-${mediaId}`,
        providerAssetId: `fixture-${mediaId}`,
        mimeType: 'image/png',
        bytes: 999,
        width: 640,
        height: 480,
        publicUrl:
          'https://res.cloudinary.com/sample/image/upload/v1720012345/shirt.png',
        status: 'ACTIVE',
        uploadExpiresAt: new Date(Date.now() + 3600000),
      },
    })
    await swaggerExecute(page, 'GET', '/v1/admin/media/{id}', 200, undefined, {
      id: mediaId,
    })
    await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/products/{id}/media',
      400,
      { items: [{ mediaId, position: 6, altText: 'Too far' }] },
      { id },
    )
    await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/products/{id}/media',
      200,
      { items: [{ mediaId, position: 0, altText: 'Front' }] },
      { id },
    )
    expect(
      await f.db.productMedia.count({ where: { productId: id, mediaId } }),
    ).toBe(1)
    await swaggerExecute(page, 'GET', '/v1/products/{slug}', 200, undefined, {
      slug: f.slug('shirt'),
    })
    const publicProduct = await request.get(`/v1/products/${f.slug('shirt')}`)
    expect(publicProduct.status()).toBe(200)
    expect((await publicProduct.json()).gallery[0].srcSet).toContain(
      '/f_auto,q_auto,w_640/',
    )
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/media/{id}',
      409,
      undefined,
      { id: mediaId },
    )
    await swaggerExecute(
      page,
      'PUT',
      '/v1/admin/products/{id}/media',
      200,
      { items: [] },
      { id },
    )
    await swaggerExecute(
      page,
      'DELETE',
      '/v1/admin/media/{id}',
      200,
      undefined,
      { id: mediaId },
    )
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } }))
        .status,
    ).toBe('PENDING_DELETE')
    expect(
      (await f.db.mediaDeletionJob.findUniqueOrThrow({ where: { mediaId } }))
        .status,
    ).toBe('PENDING')
  } finally {
    await f.db.productMedia.deleteMany({ where: { mediaId } })
    await f.db.mediaDeletionJob.deleteMany({ where: { mediaId } })
    await f.db.mediaAsset.deleteMany({ where: { id: mediaId } })
    await f.close()
  }
})
