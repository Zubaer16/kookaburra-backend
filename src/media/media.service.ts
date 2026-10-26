import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import { CloudinaryMediaProvider } from './storage'
import { ReplaceProductGalleryDto, StartMediaUploadDto } from './media.dto'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const UPLOAD_TTL_MS = 60 * 60 * 1000
const serialize = (asset: {
  id: string
  status: string
  publicUrl: string | null
  mimeType: string
  bytes: number
  width: number
  height: number
}) => ({
  id: asset.id,
  status: asset.status,
  url: asset.publicUrl,
  mimeType: asset.mimeType,
  bytes: asset.bytes,
  width: asset.width,
  height: asset.height,
})
@Injectable()
export class MediaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly storage: CloudinaryMediaProvider,
  ) {}

  async createUpload(input: StartMediaUploadDto, actorId: string) {
    const id = randomUUID()
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    const objectKey = `${namespace}/${id}`
    // Check provider is configured before creating a pending row.
    const instruction = this.storage.signedUpload(objectKey)
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS)
    await this.db.client.$transaction(async (tx) => {
      await tx.mediaAsset.create({
        data: {
          id,
          provider: this.storage.key,
          namespace,
          objectKey,
          mimeType: input.mimeType,
          bytes: input.bytes,
          uploadExpiresAt: expiresAt,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'media.upload.requested',
          targetType: 'media',
          targetId: id,
        },
      })
    })
    return { mediaId: id, ...instruction, expiresAt: expiresAt.toISOString() }
  }

  async completeUpload(id: string, actorId: string) {
    const asset = await this.db.client.mediaAsset.findUnique({ where: { id } })
    if (!asset) throw new NotFoundException('Media not found')
    if (asset.status === 'ACTIVE') return serialize(asset)
    if (asset.status !== 'PENDING_UPLOAD' || asset.uploadExpiresAt < new Date())
      throw new ConflictException('Upload expired or no longer pending')
    if (
      asset.provider !== this.storage.key ||
      asset.namespace !== this.config.get('MEDIA_NAMESPACE', { infer: true }) ||
      !asset.objectKey.startsWith(`${asset.namespace}/`)
    )
      throw new ConflictException('Wrong storage namespace')
    const verified = await this.storage.verify(asset.objectKey)
    if (verified.mimeType !== asset.mimeType || verified.bytes > asset.bytes)
      throw new ConflictException(
        'Uploaded image differs from approved type/size',
      )
    const update = await this.db.client.mediaAsset.updateMany({
      where: {
        id,
        status: 'PENDING_UPLOAD',
        uploadExpiresAt: { gt: new Date() },
      },
      data: {
        status: 'ACTIVE',
        providerAssetId: verified.assetId,
        publicUrl: verified.url,
        mimeType: verified.mimeType,
        bytes: verified.bytes,
        width: verified.width,
        height: verified.height,
      },
    })
    if (!update.count)
      throw new ConflictException('Upload was finalized or expired')
    await this.db.client.auditEvent.create({
      data: {
        actorId,
        action: 'media.upload.verified',
        targetType: 'media',
        targetId: id,
      },
    })
    return serialize(
      await this.db.client.mediaAsset.findUniqueOrThrow({ where: { id } }),
    )
  }
  async getAsset(id: string) {
    const asset = await this.db.client.mediaAsset.findUnique({ where: { id } })
    if (!asset) throw new NotFoundException('Media not found')
    return serialize(asset)
  }

  private async lockMedia(tx: Prisma.TransactionClient, ids: string[]) {
    // Common row locking order shared by gallery replacement & cleanup claims.
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM media_assets WHERE id = ${id}::uuid FOR UPDATE`
  }
  private async scheduleDeletion(
    tx: Prisma.TransactionClient,
    id: string,
    when: Date,
  ) {
    const references = await tx.productMedia.count({ where: { mediaId: id } })
    if (references > 0) return false
    const asset = await tx.mediaAsset.findUnique({ where: { id } })
    if (
      !asset ||
      asset.status === 'DELETED' ||
      asset.status === 'PENDING_DELETE'
    )
      return false
    if (asset.status === 'DELETE_FAILED')
      throw new ConflictException(
        'Failed media deletion requires reconciliation',
      )
    await tx.mediaAsset.update({
      where: { id },
      data: { status: 'PENDING_DELETE' },
    })
    await tx.mediaDeletionJob.upsert({
      where: { mediaId: id },
      create: { mediaId: id, availableAt: when, status: 'PENDING' },
      update: {
        availableAt: when,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        claimedAt: null,
      },
    })
    return true
  }
  async replaceGallery(
    productId: string,
    input: ReplaceProductGalleryDto,
    actorId: string,
  ) {
    const ids = input.items.map((x) => x.mediaId)
    const positions = input.items.map((x) => x.position)
    if (new Set(positions).size !== positions.length)
      throw new BadRequestException('Gallery positions must be unique')
    // enforce sequential position order for stable cover, and max six files.
    if (positions.sort((a, b) => a - b).some((value, index) => value !== index))
      throw new BadRequestException(
        'Gallery positions must be consecutive from zero',
      )
    return this.db.client.$transaction(
      async (tx) => {
        const products = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`
        if (!products.length) throw new NotFoundException('Product not found')
        const previous = await tx.productMedia.findMany({
          where: { productId },
          select: { mediaId: true },
        })
        await this.lockMedia(tx, [...ids, ...previous.map((x) => x.mediaId)])
        for (const id of ids) {
          const media = await tx.mediaAsset.findUnique({
            where: { id },
            include: { deletionJob: true },
          })
          if (
            !media ||
            media.namespace !==
              this.config.get('MEDIA_NAMESPACE', { infer: true }) ||
            !media.publicUrl ||
            !media.providerAssetId ||
            !(
              media.status === 'ACTIVE' ||
              (media.status === 'PENDING_DELETE' &&
                media.deletionJob?.status === 'PENDING')
            )
          )
            throw new ConflictException(
              'Gallery image must be verified and reusable',
            )
          if (media.status === 'PENDING_DELETE') {
            await tx.mediaDeletionJob.update({
              where: { mediaId: id },
              data: { status: 'CANCELLED' },
            })
            await tx.mediaAsset.update({
              where: { id },
              data: { status: 'ACTIVE' },
            })
          }
        }
        await tx.productMedia.deleteMany({ where: { productId } })
        if (input.items.length)
          await tx.productMedia.createMany({
            data: input.items.map((x) => ({
              productId,
              mediaId: x.mediaId,
              position: x.position,
              altText: (x.altText ?? '').trim(),
            })),
          })
        for (const id of previous.map((x) => x.mediaId)) {
          if (!ids.includes(id))
            await this.scheduleDeletion(
              tx,
              id,
              new Date(Date.now() + RETENTION_MS),
            )
        }
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'product.media.replaced',
            targetType: 'product',
            targetId: productId,
          },
        })
        return this.listProductGalleryTx(tx, productId)
      },
      { isolationLevel: 'Serializable' },
    )
  }
  private async listProductGalleryTx(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    const links = await tx.productMedia.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
      include: { media: true },
    })
    return links
      .filter((x) => x.media.status === 'ACTIVE')
      .map((x) => ({
        id: x.mediaId,
        url: x.media.publicUrl,
        src: x.media.publicUrl,
        alt: x.altText,
        position: x.position,
        width: x.media.width,
        height: x.media.height,
      }))
  }
  async deleteUnattached(id: string, actorId: string) {
    return this.db.client.$transaction(
      async (tx) => {
        await this.lockMedia(tx, [id])
        const asset = await tx.mediaAsset.findUnique({ where: { id } })
        if (!asset) throw new NotFoundException('Media not found')
        if (await tx.productMedia.count({ where: { mediaId: id } }))
          throw new ConflictException(
            'Detach media from all products before deletion',
          )
        if (asset.status === 'PENDING_DELETE') return { id, scheduled: true }
        if (asset.status === 'DELETED') return { id, scheduled: false }
        await this.scheduleDeletion(tx, id, new Date(Date.now() + RETENTION_MS))
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'media.delete.scheduled',
            targetType: 'media',
            targetId: id,
          },
        })
        return { id, scheduled: true }
      },
      { isolationLevel: 'Serializable' },
    )
  }

  async deletionJobs() {
    return this.db.client.mediaDeletionJob.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        mediaId: true,
        status: true,
        attempts: true,
        availableAt: true,
        createdAt: true,
        lastError: true,
      },
    })
  }
  async retryDeletion(jobId: string, actorId: string) {
    return this.db.client.$transaction(
      async (tx) => {
        const job = await tx.mediaDeletionJob.findUnique({
          where: { id: jobId },
        })
        if (!job) throw new NotFoundException('Deletion job not found')
        await this.lockMedia(tx, [job.mediaId])
        const asset = await tx.mediaAsset.findUnique({
          where: { id: job.mediaId },
        })
        if (
          !asset ||
          job.status !== 'FAILED' ||
          asset.status !== 'DELETE_FAILED'
        )
          throw new ConflictException(
            'Only failed deletion jobs can be retried',
          )
        if (
          asset.namespace !==
            this.config.get('MEDIA_NAMESPACE', { infer: true }) ||
          asset.provider !== this.storage.key ||
          !asset.objectKey.startsWith(`${asset.namespace}/`)
        )
          throw new ConflictException('Wrong storage namespace')
        if (await tx.productMedia.count({ where: { mediaId: job.mediaId } }))
          throw new ConflictException('Media remains referenced')
        await tx.mediaAsset.update({
          where: { id: job.mediaId },
          data: { status: 'PENDING_DELETE' },
        })
        await tx.mediaDeletionJob.update({
          where: { id: job.id },
          data: {
            status: 'PENDING',
            attempts: 0,
            claimedAt: null,
            availableAt: new Date(),
            lastError: null,
          },
        })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'media.delete.retry',
            targetType: 'media',
            targetId: job.mediaId,
          },
        })
        return { id: job.id, status: 'PENDING' }
      },
      { isolationLevel: 'Serializable' },
    )
  }

  /** Durable, idempotent, batch processor. Run by scheduler/VPS worker, not in HTTP background. */
  async cleanupBatch(limit = 20) {
    const now = new Date()
    // Expired abandoned uploads may exist remotely; enqueue their known keys.
    const expired = await this.db.client.mediaAsset.findMany({
      where: {
        status: 'PENDING_UPLOAD',
        uploadExpiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      take: limit,
      select: { id: true },
    })
    for (const item of expired) {
      await this.db.client.$transaction(async (tx) => {
        await this.lockMedia(tx, [item.id])
        if (
          (await tx.mediaAsset.findUnique({ where: { id: item.id } }))
            ?.status === 'PENDING_UPLOAD'
        )
          await this.scheduleDeletion(tx, item.id, now)
      })
    }
    // Recover abandoned PROCESSING jobs only after their network call has timed out.
    await this.db.client.mediaDeletionJob.updateMany({
      where: {
        status: 'PROCESSING',
        claimedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      data: { status: 'PENDING', claimedAt: null },
    })
    const jobs = await this.db.client.mediaDeletionJob.findMany({
      where: { status: 'PENDING', availableAt: { lte: now } },
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })
    const results = { processed: 0, failed: 0, skipped: 0 }
    for (const job of jobs) {
      const claimed = await this.db.client.$transaction(async (tx) => {
        await this.lockMedia(tx, [job.mediaId])
        const media = await tx.mediaAsset.findUnique({
          where: { id: job.mediaId },
        })
        if (
          !media ||
          media.status !== 'PENDING_DELETE' ||
          (await tx.productMedia.count({ where: { mediaId: job.mediaId } }))
        )
          return null
        const claim = await tx.mediaDeletionJob.updateMany({
          where: {
            id: job.id,
            status: 'PENDING',
            availableAt: { lte: new Date() },
          },
          data: {
            status: 'PROCESSING',
            claimedAt: new Date(),
            attempts: { increment: 1 },
          },
        })
        return claim.count ? media : null
      })
      if (!claimed) {
        results.skipped++
        continue
      }
      try {
        const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
        if (
          claimed.provider !== this.storage.key ||
          claimed.namespace !== namespace ||
          !claimed.objectKey.startsWith(`${namespace}/`)
        )
          throw new ConflictException('Media provider or namespace mismatch')
        await this.storage.delete(claimed.objectKey)
        await this.db.client.$transaction(async (tx) => {
          await tx.mediaAsset.update({
            where: { id: claimed.id },
            data: { status: 'DELETED', publicUrl: null },
          })
          await tx.mediaDeletionJob.update({
            where: { id: job.id },
            data: { status: 'COMPLETED', claimedAt: null, lastError: null },
          })
        })
        results.processed++
      } catch {
        // Never log or persist provider secret/error internals.
        const retry = job.attempts + 1 < 5
        const delay = Math.min(
          24 * 60 * 60 * 1000,
          Math.pow(2, job.attempts) * 60 * 1000,
        )
        await this.db.client.$transaction(async (tx) => {
          await tx.mediaDeletionJob.update({
            where: { id: job.id },
            data: {
              status: retry ? 'PENDING' : 'FAILED',
              claimedAt: null,
              lastError:
                'Provider cleanup failed; inspect provider configuration',
              availableAt: new Date(Date.now() + delay),
            },
          })
          if (!retry)
            await tx.mediaAsset.update({
              where: { id: claimed.id },
              data: { status: 'DELETE_FAILED' },
            })
        })
        results.failed++
      }
    }
    return results
  }
}
