import { BadRequestException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import {
  PutStoreProfileDto,
  type PublicStoreProfileDto,
  type AdminStoreProfileDto,
} from './store-profile.dto'

const SINGLETON = 'primary'

type ProfileRow = {
  storeName: string
  supportEmail: string
  websiteUrl: string
  timezone: string
  supportNotice: string
  updatedAt: Date
}

function project(row: ProfileRow | null): PublicStoreProfileDto {
  return row
    ? {
        configured: true,
        storeName: row.storeName,
        supportEmail: row.supportEmail,
        websiteUrl: row.websiteUrl,
        timezone: row.timezone,
        supportNotice: row.supportNotice,
      }
    : {
        configured: false,
        storeName: null,
        supportEmail: null,
        websiteUrl: '',
        timezone: null,
        supportNotice: '',
      }
}

@Injectable()
export class StoreProfileService {
  constructor(private readonly database: DatabaseService) {}

  async publicProfile(): Promise<PublicStoreProfileDto> {
    const row = await this.database.client.storeProfile.findUnique({
      where: { key: SINGLETON },
    })
    return project(row)
  }

  async adminProfile(): Promise<AdminStoreProfileDto> {
    const row = await this.database.client.storeProfile.findUnique({
      where: { key: SINGLETON },
    })
    return { ...project(row), updatedAt: row?.updatedAt.toISOString() ?? null }
  }

  async put(
    dto: PutStoreProfileDto,
    actorId: string,
  ): Promise<AdminStoreProfileDto> {
    const websiteUrl = dto.websiteUrl.trim()
    if (websiteUrl) {
      let url: URL
      try {
        url = new URL(websiteUrl)
      } catch {
        throw new BadRequestException('Invalid HTTPS website URL')
      }
      // The URL is an informational link, not permission to redirect, fetch or alter CORS.
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.port
      )
        throw new BadRequestException('Invalid HTTPS website URL')
    }
    const storeName = dto.storeName.trim()
    if (storeName.length < 2)
      throw new BadRequestException(
        'Store name must contain at least two characters',
      )
    const data = {
      storeName,
      supportEmail: dto.supportEmail.trim().toLowerCase(),
      websiteUrl,
      timezone: dto.timezone,
      supportNotice: dto.supportNotice.trim(),
    }
    // A single atomic write and a PII-free audit event. Never trust front-end role fields.
    return this.database.client.$transaction(async (tx) => {
      const row = await tx.storeProfile.upsert({
        where: { key: SINGLETON },
        create: { key: SINGLETON, ...data },
        update: data,
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'store.profile.updated',
          targetType: 'store_profile',
          targetId: SINGLETON,
        },
      })
      return { ...project(row), updatedAt: row.updatedAt.toISOString() }
    })
  }
}
