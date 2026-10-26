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
          width: 100,
          height: 80,
          publicUrl: `https://res.cloudinary.com/sample/image/upload/${label}.png`,
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
