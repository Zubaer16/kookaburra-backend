import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture } from './catalog-test-support'
import { MediaService } from '../src/media/media.service'
import type { DatabaseService } from '../src/database/database.service'
import type { ConfigService } from '@nestjs/config'
import type { Environment } from '../src/config/environment'
import type { MediaStorageRegistry } from '../src/media/storage.registry'
import type { DiskMediaProvider } from '../src/media/disk.storage'
import type { MediaCdnPurgeService } from '../src/media/cdn-purge.service'
import type { S3MediaProvider } from '../src/media/s3.storage'

test('03C-3 reconciliation: dry-run, retention, shared protection, orphan scheduling and deletion-job repair', async ({ request }) => {
  const fixture = new CatalogTestFixture(request)
  const namespace = 'projects/kookaburra/products'
  const ids = Array.from({ length: 8 }, () => randomUUID())
  const [orphan, linked, fresh, foreign, missing, cancelled, failed, activeFailed] = ids as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  const svc = new MediaService(
    { client: fixture.db } as DatabaseService,
    { get: () => namespace } as unknown as ConfigService<Environment, true>,
    {} as MediaStorageRegistry,
    {} as DiskMediaProvider,
    {} as MediaCdnPurgeService,
    {} as S3MediaProvider,
  )
  try {
    const product = await fixture.db.product.create({
      data: {
        slug: fixture.slug('reconcile-linked'),
        title: 'Reconcile shared protection',
        sku: fixture.sku('reconcile-linked'),
        priceMinor: 500,
      },
    })
    const records = [
      [orphan, 'ACTIVE', namespace],
      [linked, 'ACTIVE', namespace],
      [fresh, 'ACTIVE', namespace],
      [foreign, 'ACTIVE', 'another/namespace'],
      [missing, 'PENDING_DELETE', namespace],
      [cancelled, 'PENDING_DELETE', namespace],
      [failed, 'DELETE_FAILED', namespace],
      [activeFailed, 'ACTIVE', namespace],
    ] as const
    for (const [id, status, assetNamespace] of records) {
      await fixture.db.mediaAsset.create({
        data: {
          id,
          provider: 'disk',
          namespace: assetNamespace,
          objectKey: `${assetNamespace}/${id}`,
          providerAssetId: id,
          mimeType: 'image/png',
          bytes: 100,
          width: 400,
          height: 300,
          publicUrl: `https://cdn.example.test/${assetNamespace}/${id}`,
          status,
          uploadExpiresAt: new Date(Date.now() + 60_000),
        },
      })
    }
    await fixture.db.mediaAsset.updateMany({
      where: { id: { in: [orphan, linked, foreign, activeFailed] } },
      data: { updatedAt: old },
    })
    await fixture.db.productMedia.create({
      data: { productId: product.id, mediaId: linked, position: 0 },
    })
    await fixture.db.mediaDeletionJob.createMany({
      data: [
        { mediaId: cancelled, status: 'CANCELLED', availableAt: old },
        { mediaId: failed, status: 'FAILED', availableAt: old },
        { mediaId: activeFailed, status: 'FAILED', availableAt: old },
      ],
    })

    const dry = await svc.reconcileBatch(25)
    expect(dry).toMatchObject({
      dryRun: true,
      orphanCandidates: 1,
      missingDeletionJobCandidates: 2,
      orphanScheduled: 0,
      deletionJobsRepaired: 0,
      failedDeletionAssets: 1,
    })
    expect(await fixture.db.mediaDeletionJob.count({
      where: { mediaId: orphan },
    })).toBe(0)

    const applied = await svc.reconcileBatch(25, true)
    expect(applied).toMatchObject({
      dryRun: false,
      orphanScheduled: 1,
      deletionJobsRepaired: 2,
      failedDeletionAssets: 1,
    })
    const scheduled = await fixture.db.mediaDeletionJob.findUniqueOrThrow({
      where: { mediaId: orphan },
    })
    expect(scheduled.status).toBe('PENDING')
    // Unreferenced originals must still get the full undo/retention window.
    expect(scheduled.availableAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    )
    for (const id of [missing, cancelled]) {
      expect((await fixture.db.mediaDeletionJob.findUniqueOrThrow({
        where: { mediaId: id },
      })).status).toBe('PENDING')
    }
    expect((await fixture.db.mediaDeletionJob.findUniqueOrThrow({
      where: { mediaId: failed },
    })).status).toBe('FAILED')
    expect((await fixture.db.mediaDeletionJob.findUniqueOrThrow({
      where: { mediaId: activeFailed },
    })).status).toBe('FAILED')
    for (const id of [linked, fresh, foreign, activeFailed]) {
      expect((await fixture.db.mediaAsset.findUniqueOrThrow({
        where: { id },
      })).status).toBe('ACTIVE')
      if (id !== activeFailed)
        expect(await fixture.db.mediaDeletionJob.count({ where: { mediaId: id } })).toBe(0)
    }
    expect(await svc.reconcileBatch(25, true)).toMatchObject({
      orphanScheduled: 0,
      deletionJobsRepaired: 0,
    })
    await expect(svc.reconcileBatch(0, true)).rejects.toThrow()
    await expect(svc.reconcileBatch(101, true)).rejects.toThrow()
  } finally {
    // Scoped fixture cleanup only; never reset user data or provider files.
    await fixture.db.productMedia.deleteMany({ where: { mediaId: { in: ids } } })
    await fixture.db.mediaDeletionJob.deleteMany({ where: { mediaId: { in: ids } } })
    await fixture.db.auditEvent.deleteMany({ where: { targetId: { in: ids } } })
    await fixture.db.mediaAsset.deleteMany({ where: { id: { in: ids } } })
    await fixture.close()
  }
})
