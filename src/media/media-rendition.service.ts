import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import sharp from 'sharp'
import { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import { Prisma } from '../generated/prisma/client'
import { S3MediaProvider } from './s3.storage'
import { DiskMediaProvider } from './disk.storage'
import { renditionKey, widthsFor, type RenditionEntry } from './renditions'

const MAX_SOURCE_BYTES = 10 * 1024 * 1024

/** Durable outbox dispatcher. This must be run by a scheduler/worker: never fire-and-forget from HTTP. */
@Injectable()
export class MediaRenditionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly s3: S3MediaProvider,
    private readonly disk: DiskMediaProvider,
  ) {}

  /** Enqueue legacy already-verified assets without modifying existing provider identity. */
  async backfill(limit = 50): Promise<number> {
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    let inserted = 0
    let cursor: string | undefined
    while (inserted < limit) {
      // Advance beyond already-scheduled assets; do not starve old pending
      // originals when the first page contains only completed/failed jobs.
      const candidates = await this.db.client.mediaAsset.findMany({
        where: {
          namespace,
          status: 'ACTIVE',
          provider: { in: ['s3', 'disk'] },
          width: { gte: 320 },
          renditions: { equals: Prisma.DbNull },
        },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      })
      if (!candidates.length) break
      cursor = candidates[candidates.length - 1]!.id
      for (const asset of candidates) {
        if (inserted >= limit) break
        // All rendition outbox rows use the media UUID as deduplication key.
        const existing = await this.db.client.outboxEvent.findUnique({
          where: { id: asset.id },
        })
        if (existing) continue
        await this.db.client.outboxEvent.create({
          data: {
            id: asset.id,
            eventType: 'media.renditions',
            payload: { mediaId: asset.id },
          },
        })
        inserted++
      }
    }
    return inserted
  }

  async processBatch(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new Error('Invalid batch size')
    // Claim recovery only after the expected max worker execution window.
    await this.db.client.outboxEvent.updateMany({
      where: {
        eventType: 'media.renditions',
        status: 'PROCESSING',
        updatedAt: { lt: new Date(Date.now() - 30 * 60_000) },
      },
      data: { status: 'PENDING', availableAt: new Date() },
    })
    const queued = await this.db.client.outboxEvent.findMany({
      where: {
        eventType: 'media.renditions',
        status: 'PENDING',
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })
    const result = { processed: 0, failed: 0, skipped: 0 }
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    for (const event of queued) {
      const claim = await this.db.client.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: 'PENDING',
          availableAt: { lte: new Date() },
        },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      })
      if (!claim.count) {
        result.skipped++
        continue
      }
      try {
        const media = await this.db.client.mediaAsset.findUnique({
          where: { id: event.id },
        })
        if (
          !media ||
          media.status !== 'ACTIVE' ||
          media.namespace !== namespace ||
          !media.objectKey.startsWith(`${namespace}/`) ||
          (media.provider !== 's3' && media.provider !== 'disk') ||
          media.width < 320
        ) {
          await this.db.client.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'COMPLETED' },
          })
          result.skipped++
          continue
        }
        // Previously completed job replays must not overwrite or re-publish files.
        if (media.renditions !== null) {
          await this.db.client.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'COMPLETED' },
          })
          result.skipped++
          continue
        }
        const original =
          media.provider === 's3'
            ? await this.s3.readSource(media.objectKey)
            : await this.disk.readSource(media.objectKey)
        if (
          original.length !== media.bytes ||
          original.length > MAX_SOURCE_BYTES
        )
          throw new Error('Stored media differs from verified size')
        const metadata = await sharp(original, {
          limitInputPixels: 60_000_000,
        }).metadata()
        if (
          metadata.width !== media.width ||
          metadata.height !== media.height ||
          !['jpeg', 'png', 'webp'].includes(String(metadata.format))
        )
          throw new Error(
            'Stored media differs from verified dimensions/format',
          )
        const expectedMime =
          metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`
        if (expectedMime !== media.mimeType)
          throw new Error('Stored media MIME mismatch')
        const output: RenditionEntry[] = []
        for (const width of widthsFor(media.width)) {
          const contents = await sharp(original, {
            limitInputPixels: 60_000_000,
          })
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: 78, effort: 4 })
            .toBuffer()
          if (!contents.length || contents.length > MAX_SOURCE_BYTES)
            throw new Error('Generated rendition size out of bounds')
          // Do not label a rotated/small output with a width it does not have.
          const renditionInfo = await sharp(contents).metadata()
          if (renditionInfo.format !== 'webp' || renditionInfo.width !== width)
            throw new Error('Rendition did not achieve requested width')
          if (media.provider === 's3')
            await this.s3.writeRendition(
              renditionKey(media.objectKey, width),
              contents,
            )
          else await this.disk.writeRendition(media.objectKey, width, contents)
          output.push({ width, bytes: contents.length })
        }
        await this.db.client.$transaction(async (tx) => {
          // Attach the durable manifest even if the asset became PENDING_DELETE during
          // generation; cleanup will delete these files before marking DELETED.
          const latest = await tx.mediaAsset.findUnique({
            where: { id: media.id },
          })
          if (
            !latest ||
            (latest.status !== 'ACTIVE' && latest.status !== 'PENDING_DELETE')
          )
            throw new Error('Media state changed during rendition generation')
          await tx.mediaAsset.update({
            where: { id: media.id },
            data: { renditions: output as unknown as Prisma.InputJsonValue },
          })
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'COMPLETED' },
          })
        })
        result.processed++
      } catch {
        // Never write storage credentials, signed URLs, bytes or provider errors to DB/log.
        const attempts = event.attempts + 1
        await this.db.client.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: attempts >= 5 ? 'FAILED' : 'PENDING',
            availableAt: new Date(
              Date.now() + Math.min(86_400_000, 2 ** attempts * 60_000),
            ),
          },
        })
        result.failed++
      }
    }
    return result
  }
}
