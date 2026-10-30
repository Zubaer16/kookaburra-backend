import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import {
  AdminStoreContentDto,
  PublicStoreContentDto,
  PutStoreContentDto,
} from './store-content.dto'

const KEY = 'primary'
type ContentRow = {
  revision: number
  seoTitle: string
  seoDescription: string
  footerText: string
  privacyPolicy: string
  termsOfService: string
  returnPolicy: string
  updatedAt: Date
}

function toPublic(row: ContentRow | null): PublicStoreContentDto {
  return row
    ? {
        configured: true,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        footerText: row.footerText,
        privacyPolicy: row.privacyPolicy,
        termsOfService: row.termsOfService,
        returnPolicy: row.returnPolicy,
      }
    : {
        configured: false,
        seoTitle: '',
        seoDescription: '',
        footerText: '',
        privacyPolicy: '',
        termsOfService: '',
        returnPolicy: '',
      }
}
function toAdmin(row: ContentRow | null): AdminStoreContentDto {
  return {
    ...toPublic(row),
    revision: row?.revision ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}

@Injectable()
export class StoreContentService {
  constructor(private readonly db: DatabaseService) {}

  async publicContent(): Promise<PublicStoreContentDto> {
    return toPublic(
      await this.db.client.storeContent.findUnique({ where: { key: KEY } }),
    )
  }

  async adminContent(): Promise<AdminStoreContentDto> {
    return toAdmin(
      await this.db.client.storeContent.findUnique({ where: { key: KEY } }),
    )
  }

  async save(
    input: PutStoreContentDto,
    actorId: string,
  ): Promise<AdminStoreContentDto> {
    const fields = {
      seoTitle: input.seoTitle.trim(),
      seoDescription: input.seoDescription.trim(),
      footerText: input.footerText.trim(),
      privacyPolicy: input.privacyPolicy.trim(),
      termsOfService: input.termsOfService.trim(),
      returnPolicy: input.returnPolicy.trim(),
    }
    try {
      return await this.db.client.$transaction(async (tx) => {
        let row: ContentRow
        if (input.expectedRevision === 0) {
          row = await tx.storeContent.create({
            data: { key: KEY, revision: 1, ...fields },
          })
        } else {
          const changed = await tx.storeContent.updateMany({
            where: { key: KEY, revision: input.expectedRevision },
            data: { ...fields, revision: { increment: 1 } },
          })
          if (changed.count !== 1)
            throw new ConflictException(
              'Store content changed. Reload and retry.',
            )
          row = await tx.storeContent.findUniqueOrThrow({ where: { key: KEY } })
        }
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'store.content.updated',
            targetType: 'store_content',
            targetId: KEY,
          },
        })
        return toAdmin(row)
      })
    } catch (error) {
      // Two simultaneous first writes: one succeeds; the other gets 409, not an internal DB error.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Store content changed. Reload and retry.')
      }
      throw error
    }
  }
}
