import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

const namespace = 'projects/kookaburra/products'
const assetUrl = (id: string) =>
  `https://cdn.example.test/${namespace}/${id}.png`

test('05B-3 PostgreSQL: verified branding, protected media, stale revision and pending-delete rescue', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const logoId = randomUUID()
  const faviconId = randomUUID()
  const previous = await f.db.storeBranding.findUnique({
    where: { key: 'primary' },
  })
  try {
    const owner = await f.account('OWNER')
    const headers = bearer(owner.token)
    for (const [id, size] of [
      [logoId, 960],
      [faviconId, 64],
    ] as const) {
      await f.db.mediaAsset.create({
        data: {
          id,
          provider: 'cloudinary',
          namespace,
          objectKey: `${namespace}/fixture-${id}`,
          providerAssetId: `fixture-${id}`,
          mimeType: 'image/png',
          bytes: 512,
          width: size,
          height: size,
          publicUrl: assetUrl(id),
          status: 'ACTIVE',
          uploadExpiresAt: new Date(Date.now() + 3600000),
        },
      })
    }
    const before = await request.get('/v1/admin/store/branding', { headers })
    expect(before.status()).toBe(200)
    const revision = (await before.json()).revision as number
    const put = async (
      nextRevision: number,
      logoMediaId: string | null,
      faviconMediaId: string | null,
    ) =>
      request.put('/v1/admin/store/branding', {
        headers,
        data: { expectedRevision: nextRevision, logoMediaId, faviconMediaId },
      })
    const saved = await put(revision, logoId, faviconId)
    expect(saved.status()).toBe(200)
    expect((await saved.json()).revision).toBe(revision + 1)
    const publicRes = await request.get('/v1/store/branding')
    expect(publicRes.status()).toBe(200)
    expect(await publicRes.json()).toMatchObject({
      configured: true,
      logo: { id: logoId, url: assetUrl(logoId), width: 960 },
      favicon: { id: faviconId, url: assetUrl(faviconId), width: 64 },
    })
    expect(JSON.stringify(await publicRes.json())).not.toContain(
      'providerAssetId',
    )
    // Product gallery and brand share the same image; detaching gallery must NOT queue a delete.
    const shared = await f.db.product.create({
      data: {
        slug: f.slug('branding-shared'),
        title: 'Branding Shared Asset',
        sku: f.sku('branding-shared'),
        priceMinor: 400,
        status: 'ACTIVE',
      },
    })
    const attachGallery = await request.put(
      `/v1/admin/products/${shared.id}/media`,
      {
        headers,
        data: {
          items: [
            { mediaId: logoId, position: 0, altText: 'Shared with brand' },
          ],
        },
      },
    )
    expect(attachGallery.status()).toBe(200)
    const detachGallery = await request.put(
      `/v1/admin/products/${shared.id}/media`,
      { headers, data: { items: [] } },
    )
    expect(detachGallery.status()).toBe(200)
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: logoId } }))
        .status,
    ).toBe('ACTIVE')
    expect(
      await f.db.mediaDeletionJob.count({ where: { mediaId: logoId } }),
    ).toBe(0)
    await assertSafeError(
      await request.delete(`/v1/admin/media/${logoId}`, { headers }),
      409,
    )
    await assertSafeError(
      await request.delete(`/v1/admin/media/${faviconId}`, { headers }),
      409,
    )
    await assertSafeError(await put(revision, null, null), 409)
    expect(
      (
        await f.db.storeBranding.findUniqueOrThrow({
          where: { key: 'primary' },
        })
      ).logoMediaId,
    ).toBe(logoId)
    const detached = await put(revision + 1, null, null)
    expect(detached.status()).toBe(200)
    // Existing Media Library handles deletion of newly unreferenced images; no provider call in update.
    const removal = await request.delete(`/v1/admin/media/${logoId}`, {
      headers,
    })
    expect(removal.status()).toBe(200)
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: logoId } }))
        .status,
    ).toBe('PENDING_DELETE')
    const rescued = await put(revision + 2, logoId, faviconId)
    expect(rescued.status()).toBe(200)
    expect(
      (
        await f.db.mediaDeletionJob.findUniqueOrThrow({
          where: { mediaId: logoId },
        })
      ).status,
    ).toBe('CANCELLED')
    expect(
      (await f.db.mediaAsset.findUniqueOrThrow({ where: { id: logoId } }))
        .status,
    ).toBe('ACTIVE')
    expect(
      await f.db.auditEvent.count({
        where: { actorId: owner.id, action: 'store.branding.updated' },
      }),
    ).toBe(3)
  } finally {
    if (previous) {
      await f.db.storeBranding.upsert({
        where: { key: 'primary' },
        create: { ...previous },
        update: { ...previous },
      })
    } else {
      await f.db.storeBranding.deleteMany({ where: { key: 'primary' } })
    }
    await f.db.mediaDeletionJob.deleteMany({
      where: { mediaId: { in: [logoId, faviconId] } },
    })
    await f.db.mediaAsset.deleteMany({
      where: { id: { in: [logoId, faviconId] } },
    })
    await f.close()
  }
})
