import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test('03C gallery ordering, shared references, detachment and durable cleanup job in isolated PostgreSQL', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const mediaIds: string[] = []
  try {
    const owner = await f.account('OWNER'),
      headers = bearer(owner.token)
    const category = await request.post('/v1/admin/categories', {
      headers,
      data: { name: '03C', slug: f.slug('cat') },
    })
    expect(category.status()).toBe(201)
    const categoryId = (await category.json()).id as string
    const products: string[] = []
    for (const name of ['first', 'second']) {
      const r = await request.post('/v1/admin/products', {
        headers,
        data: {
          title: 'Media Product',
          slug: f.slug(name),
          sku: f.sku(name),
          priceMinor: 900,
          status: 'ACTIVE',
          categoryIds: [categoryId],
        },
      })
      expect(r.status()).toBe(201)
      products.push((await r.json()).id)
    }
    const namespace = 'projects/kookaburra/products'
    for (const label of ['front', 'back']) {
      const id = randomUUID()
      mediaIds.push(id)
      await f.db.mediaAsset.create({
        data: {
          id,
          provider: 'cloudinary',
          namespace,
          objectKey: `${namespace}/fixture-${id}`,
          providerAssetId: `fixture-${id}`,
          mimeType: 'image/png',
          bytes: 100,
          width: 960,
          height: 720,
          publicUrl: `https://res.cloudinary.com/sample/image/upload/v1720012345/${label}.png`,
          status: 'ACTIVE',
          uploadExpiresAt: new Date(Date.now() + 3600000),
        },
      })
    }
    const gallery = [
      { mediaId: mediaIds[1], position: 0, altText: 'Back' },
      { mediaId: mediaIds[0], position: 1, altText: 'Front' },
    ]
    let r = await request.put(`/v1/admin/products/${products[0]}/media`, {
      headers,
      data: { items: gallery },
    })
    expect(r.status()).toBe(200)
    expect((await r.json()).map((x: { alt: string }) => x.alt)).toEqual([
      'Back',
      'Front',
    ])
    r = await request.get(`/v1/products/${f.slug('first')}`)
    expect(r.status()).toBe(200)
    const publicProduct = await r.json()
    expect(publicProduct.gallery.map((x: { alt: string }) => x.alt)).toEqual([
      'Back',
      'Front',
    ])
    expect(publicProduct.image).toContain('back.png')
    expect(publicProduct.gallery[0].srcSet).toContain('/f_auto,q_auto,w_960/')
    expect(publicProduct.gallery[0].srcSet).not.toContain('w_1280/')
    expect(publicProduct.gallery[0].sizes).toContain('100vw')
    expect(JSON.stringify(publicProduct)).not.toContain('providerAssetId')
    await assertSafeError(
      await request.delete(`/v1/admin/media/${mediaIds[0]}`, { headers }),
      409,
    )
    r = await request.put(`/v1/admin/products/${products[1]}/media`, {
      headers,
      data: {
        items: [{ mediaId: mediaIds[0], position: 0, altText: 'Shared' }],
      },
    })
    expect(r.status()).toBe(200)
    r = await request.put(`/v1/admin/products/${products[0]}/media`, {
      headers,
      data: { items: [] },
    })
    expect(r.status()).toBe(200)
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaIds[0] } }))
        .status,
    ).toBe('ACTIVE')
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaIds[1] } }))
        .status,
    ).toBe('PENDING_DELETE')
    expect(
      (
        await f.db.mediaDeletionJob.findUniqueOrThrow({
          where: { mediaId: mediaIds[1] },
        })
      ).status,
    ).toBe('PENDING')
    r = await request.delete(`/v1/admin/products/${products[1]}`, { headers })
    expect(r.status()).toBe(200)
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaIds[0] } }))
        .status,
    ).toBe('PENDING_DELETE')
    // Undo an unprocessed scheduled delete by attaching back to active product.
    r = await request.put(`/v1/admin/products/${products[0]}/media`, {
      headers,
      data: {
        items: [{ mediaId: mediaIds[1], position: 0, altText: 'Restored' }],
      },
    })
    expect(r.status()).toBe(200)
    expect(
      (
        await f.db.mediaDeletionJob.findUniqueOrThrow({
          where: { mediaId: mediaIds[1] },
        })
      ).status,
    ).toBe('CANCELLED')
    await request.put(`/v1/admin/products/${products[0]}/media`, {
      headers,
      data: { items: [] },
    })
    expect(
      (
        await f.db.mediaDeletionJob.findUniqueOrThrow({
          where: { mediaId: mediaIds[1] },
        })
      ).status,
    ).toBe('PENDING')
  } finally {
    // Only this fixture's IDs; never reset any database or touch production.
    await f.db.productMedia.deleteMany({ where: { mediaId: { in: mediaIds } } })
    await f.db.mediaDeletionJob.deleteMany({
      where: { mediaId: { in: mediaIds } },
    })
    await f.db.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } })
    await f.close()
  }
})

test('03C-2A provider switching: gallery accepts stored S3 asset and schedules safe deletion without rewriting provider', async ({
  request,
}) => {
  const fixture = new CatalogTestFixture(request)
  const mediaId = randomUUID()
  try {
    const owner = await fixture.account('OWNER')
    const headers = bearer(owner.token)
    const category = await request.post('/v1/admin/categories', {
      headers,
      data: {
        name: 'Mixed Providers',
        slug: fixture.slug('provider-category'),
      },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers,
      data: {
        title: 'Provider Migration Product',
        slug: fixture.slug('provider-product'),
        sku: fixture.sku('provider-product'),
        priceMinor: 2500,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    const namespace = 'projects/kookaburra/products'
    await fixture.db.mediaAsset.create({
      data: {
        id: mediaId,
        provider: 's3',
        namespace,
        objectKey: `${namespace}/${mediaId}`,
        providerAssetId: 'placeholder-sha256-for-isolated-fixture',
        mimeType: 'image/png',
        bytes: 2048,
        width: 640,
        height: 480,
        publicUrl: `https://cdn.example.test/${namespace}/${mediaId}`,
        status: 'ACTIVE',
        uploadExpiresAt: new Date(Date.now() + 3600000),
      },
    })
    const attached = await request.put(
      `/v1/admin/products/${productId}/media`,
      {
        headers,
        data: { items: [{ mediaId, position: 0, altText: 'S3 cover' }] },
      },
    )
    expect(attached.status()).toBe(200)
    const catalog = await request.get(
      `/v1/products/${fixture.slug('provider-product')}`,
    )
    expect(catalog.status()).toBe(200)
    const body = await catalog.json()
    expect(body.image).toContain('cdn.example.test')
    expect(body.gallery[0]).not.toHaveProperty('srcSet')
    expect(JSON.stringify(body)).not.toContain('placeholder-sha256')
    const detached = await request.put(
      `/v1/admin/products/${productId}/media`,
      {
        headers,
        data: { items: [] },
      },
    )
    expect(detached.status()).toBe(200)
    const stored = await fixture.db.mediaAsset.findUniqueOrThrow({
      where: { id: mediaId },
    })
    expect(stored.provider).toBe('s3')
    expect(stored.status).toBe('PENDING_DELETE')
    expect(
      await fixture.db.mediaDeletionJob.count({
        where: { mediaId, status: 'PENDING' },
      }),
    ).toBe(1)
  } finally {
    await fixture.db.productMedia.deleteMany({ where: { mediaId } })
    await fixture.db.mediaDeletionJob.deleteMany({ where: { mediaId } })
    await fixture.db.mediaAsset.deleteMany({ where: { id: mediaId } })
    await fixture.close()
  }
})

test('03C-2C2 DB contract: only a stored READY rendition manifest publishes S3 srcSet', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const mediaId = randomUUID()
  const namespace = 'projects/kookaburra/products'
  try {
    const owner = await f.account('OWNER')
    const headers = bearer(owner.token)
    const category = await request.post('/v1/admin/categories', {
      headers,
      data: { name: 'Rendition', slug: f.slug('rendition-cat') },
    })
    expect(category.status()).toBe(201)
    const slug = f.slug('rendition-shirt')
    const product = await request.post('/v1/admin/products', {
      headers,
      data: {
        title: 'Rendition Shirt',
        slug,
        sku: f.sku('rendition'),
        priceMinor: 1000,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const url = `https://cdn.example.test/${namespace}/${mediaId}`
    await f.db.mediaAsset.create({
      data: {
        id: mediaId,
        provider: 's3',
        namespace,
        objectKey: `${namespace}/${mediaId}`,
        providerAssetId: 'synthetic-for-test',
        mimeType: 'image/png',
        bytes: 2048,
        width: 640,
        height: 480,
        publicUrl: url,
        status: 'ACTIVE',
        uploadExpiresAt: new Date(Date.now() + 60000),
      },
    })
    expect(
      (
        await request.put(
          `/v1/admin/products/${(await product.json()).id}/media`,
          {
            headers,
            data: { items: [{ mediaId, position: 0, altText: 'Front' }] },
          },
        )
      ).status(),
    ).toBe(200)
    const before = await (await request.get(`/v1/products/${slug}`)).json()
    expect(before.gallery[0].srcSet).toBeUndefined()
    await f.db.mediaAsset.update({
      where: { id: mediaId },
      data: {
        renditions: [
          { width: 320, bytes: 1800 },
          { width: 480, bytes: 2900 },
        ],
      },
    })
    const after = await (await request.get(`/v1/products/${slug}`)).json()
    expect(after.gallery[0].srcSet).toContain(`${url}-r/w_320.webp 320w`)
    expect(after.gallery[0].srcSet).toContain(`${url}-r/w_480.webp 480w`)
    expect(after.gallery[0].srcSet).not.toContain('w_640.webp')
    expect(JSON.stringify(after)).not.toContain('providerAssetId')
  } finally {
    await f.db.productMedia.deleteMany({ where: { mediaId } })
    await f.db.mediaDeletionJob.deleteMany({ where: { mediaId } })
    await f.db.mediaAsset.deleteMany({ where: { id: mediaId } })
    await f.close()
  }
})
