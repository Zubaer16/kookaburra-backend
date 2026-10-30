import { ConflictException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import type { Environment } from '../config/environment'
import {
  AdminStoreBrandingDto,
  PutStoreBrandingDto,
  PublicStoreBrandingDto,
} from './store-branding.dto'

const KEY = 'primary'
type Asset = {
  id: string
  status: string
  providerAssetId: string | null
  publicUrl: string | null
  mimeType: string
  width: number
  height: number
  bytes: number
}
type BrandingRow = {
  revision: number
  updatedAt: Date
  logoMedia: Asset | null
  faviconMedia: Asset | null
}
function publicAsset(asset: Asset | null) {
  // Never expose provider IDs or an asset that is no longer verified and active.
  return asset?.status === 'ACTIVE' && asset.publicUrl && asset.providerAssetId
    ? {
        id: asset.id,
        url: asset.publicUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      }
    : null
}
function project(row: BrandingRow | null): PublicStoreBrandingDto {
  return {
    configured: !!row,
    logo: publicAsset(row?.logoMedia ?? null),
    favicon: publicAsset(row?.faviconMedia ?? null),
  }
}
function adminProject(row: BrandingRow | null): AdminStoreBrandingDto {
  return {
    ...project(row),
    revision: row?.revision ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}

@Injectable()
export class StoreBrandingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private include() {
    return { logoMedia: true, faviconMedia: true } as const
  }

  async publicBranding(): Promise<PublicStoreBrandingDto> {
    return project(
      await this.db.client.storeBranding.findUnique({
        where: { key: KEY },
        include: this.include(),
      }),
    )
  }
  async adminBranding(): Promise<AdminStoreBrandingDto> {
    return adminProject(
      await this.db.client.storeBranding.findUnique({
        where: { key: KEY },
        include: this.include(),
      }),
    )
  }

  async save(
    input: PutStoreBrandingDto,
    actorId: string,
  ): Promise<AdminStoreBrandingDto> {
    const ids = [
      ...new Set(
        [input.logoMediaId, input.faviconMediaId].filter(
          (id): id is string => !!id,
        ),
      ),
    ].sort()
    const namespace = this.config.get('MEDIA_NAMESPACE', { infer: true })
    try {
      return await this.db.client.$transaction(
        async (tx) => {
          // Same deterministic media-row lock ordering as gallery attachment/cleanup.
          for (const id of ids) {
            const found = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM media_assets WHERE id = ${id}::uuid FOR UPDATE`
            if (!found.length)
              throw new ConflictException('Branding image is unavailable')
          }
          for (const id of ids) {
            const asset = await tx.mediaAsset.findUnique({
              where: { id },
              include: { deletionJob: true },
            })
            if (
              !asset ||
              asset.namespace !== namespace ||
              !asset.objectKey.startsWith(`${namespace}/`) ||
              !asset.publicUrl ||
              !asset.providerAssetId ||
              asset.width < 1 ||
              asset.height < 1 ||
              asset.bytes < 1 ||
              asset.bytes > 10485760 ||
              !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(
                asset.mimeType,
              ) ||
              !(
                asset.status === 'ACTIVE' ||
                (asset.status === 'PENDING_DELETE' &&
                  asset.deletionJob?.status === 'PENDING')
              )
            ) {
              throw new ConflictException(
                'Branding image must be verified, active and reusable',
              )
            }
            if (
              id === input.faviconMediaId &&
              (asset.width !== asset.height ||
                asset.width < 32 ||
                asset.width > 512 ||
                asset.mimeType === 'image/jpeg')
            ) {
              throw new ConflictException(
                'Favicon must be a square PNG/WebP/AVIF image (32–512 px)',
              )
            }
            if (asset.status === 'PENDING_DELETE') {
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
          if (input.expectedRevision === 0) {
            await tx.storeBranding.create({
              data: {
                key: KEY,
                revision: 1,
                logoMediaId: input.logoMediaId,
                faviconMediaId: input.faviconMediaId,
              },
            })
          } else {
            const changed = await tx.storeBranding.updateMany({
              where: { key: KEY, revision: input.expectedRevision },
              data: {
                logoMediaId: input.logoMediaId,
                faviconMediaId: input.faviconMediaId,
                revision: { increment: 1 },
              },
            })
            if (changed.count !== 1)
              throw new ConflictException(
                'Store branding changed. Reload and retry.',
              )
          }
          await tx.auditEvent.create({
            data: {
              actorId,
              action: 'store.branding.updated',
              targetType: 'store_branding',
              targetId: KEY,
            },
          })
          const saved = await tx.storeBranding.findUniqueOrThrow({
            where: { key: KEY },
            include: this.include(),
          })
          // Detached assets are not deleted here. Existing media reconciliation schedules
          // unreferenced assets after its retention checks; shared assets stay protected.
          return adminProject(saved)
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2034'].includes(error.code)
      ) {
        throw new ConflictException(
          'Store branding changed or image unavailable. Reload and retry.',
        )
      }
      throw error
    }
  }
}
