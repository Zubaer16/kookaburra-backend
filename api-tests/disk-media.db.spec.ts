import { expect, test } from '@playwright/test'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAPAAAAC0CAYAAACqnKHoAAAAvklEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GOj0gABFJKdrgAAAABJRU5ErkJggg==',
  'base64',
)

test('03C-2B real DB + signed VPS disk PUT, byte verification, public reference gate and cleanup scheduling', async ({
  request,
}) => {
  expect(process.env.MEDIA_PROVIDER).toBe('disk')
  const root = process.env.MEDIA_DISK_ROOT
  expect(root).toBeTruthy()
  const f = new CatalogTestFixture(request)
  let mediaId: string | undefined
  try {
    const owner = await f.account('OWNER')
    const auth = bearer(owner.token)
    const start = await request.post('/v1/admin/media/uploads', {
      headers: auth,
      data: { mimeType: 'image/png', bytes: png.length },
    })
    expect(start.status()).toBe(201)
    const signed = (await start.json()) as {
      mediaId: string
      uploadUrl: string
      method: string
      fields: object
      headers: Record<string, string>
    }
    mediaId = signed.mediaId
    expect(signed.method).toBe('PUT')
    expect(signed.fields).toEqual({})
    expect(signed.uploadUrl).toContain(`/v1/media/disk-uploads/${mediaId}`)
    expect(signed.headers).toHaveProperty('X-Media-Upload-Token')
    const putUrl = new URL(signed.uploadUrl)
    const uploadPath = putUrl.pathname
    await assertSafeError(
      await request.put(uploadPath, {
        headers: { 'Content-Type': 'image/png', 'X-Media-Upload-Token': 'bad' },
        data: png,
      }),
      403,
    )
    const put = await request.put(uploadPath, {
      headers: signed.headers,
      data: png,
    })
    expect(put.status()).toBe(200)
    await assertSafeError(
      await request.put(uploadPath, {
        headers: signed.headers,
        data: png,
      }),
      409,
    )
    const completed = await request.post(
      `/v1/admin/media/${mediaId}/complete`,
      { headers: auth },
    )
    expect(completed.status()).toBe(201)
    const verified = await completed.json()
    expect(verified).toMatchObject({
      status: 'ACTIVE',
      mimeType: 'image/png',
      bytes: png.length,
      width: 240,
      height: 180,
    })
    expect(verified.url).toBe(`http://127.0.0.1:4101/v1/media/files/${mediaId}`)
    await assertSafeError(await request.get(`/v1/media/files/${mediaId}`), 404)
    const category = await request.post('/v1/admin/categories', {
      headers: auth,
      data: { name: 'VPS test', slug: f.slug('category') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: auth,
      data: {
        title: 'VPS Image',
        slug: f.slug('shirt'),
        sku: f.sku('shirt'),
        priceMinor: 1500,
        status: 'ACTIVE',
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    const attached = await request.put(
      `/v1/admin/products/${productId}/media`,
      {
        headers: auth,
        data: { items: [{ mediaId, position: 0, altText: 'Front' }] },
      },
    )
    expect(attached.status()).toBe(200)
    const served = await request.get(`/v1/media/files/${mediaId}`)
    expect(served.status()).toBe(200)
    expect(served.headers()['content-type']).toContain('image/png')
    expect(served.headers()['cache-control']).toContain('max-age=60')
    expect(await served.body()).toEqual(png)
    // Original is only 240px wide, so the rendition worker must not invent 320px.
    await assertSafeError(
      await request.get(`/v1/media/files/${mediaId}?width=320`),
      404,
    )
    await assertSafeError(
      await request.get(`/v1/media/files/${mediaId}?width=123`),
      400,
    )
    expect(
      (await request.get(`/v1/products/${f.slug('shirt')}`)).status(),
    ).toBe(200)
    const detached = await request.put(
      `/v1/admin/products/${productId}/media`,
      {
        headers: auth,
        data: { items: [] },
      },
    )
    expect(detached.status()).toBe(200)
    await assertSafeError(await request.get(`/v1/media/files/${mediaId}`), 404)
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } }))
        .status,
    ).toBe('PENDING_DELETE')
    expect(
      (await f.db.mediaDeletionJob.findUniqueOrThrow({ where: { mediaId } }))
        .status,
    ).toBe('PENDING')
    expect(
      await readFile(
        join(root!, 'projects', 'kookaburra', 'products', mediaId),
      ),
    ).toEqual(png)
  } finally {
    if (mediaId) {
      await f.db.productMedia.deleteMany({ where: { mediaId } })
      await f.db.mediaDeletionJob.deleteMany({ where: { mediaId } })
      await f.db.mediaAsset.deleteMany({ where: { id: mediaId } })
    }
    await f.close()
    if (root) await rm(root, { force: true, recursive: true })
  }
})
