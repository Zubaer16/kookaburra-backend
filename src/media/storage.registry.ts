import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Environment } from '../config/environment'
import type { MediaStorageProvider } from './storage'
import { CloudinaryMediaProvider } from './storage'
import { S3MediaProvider } from './s3.storage'
import { DiskMediaProvider } from './disk.storage'

/** Persist provider per asset: changing default never reroutes deletion of old files. */
@Injectable()
export class MediaStorageRegistry {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly cloudinary: CloudinaryMediaProvider,
    private readonly s3: S3MediaProvider,
    private readonly disk: DiskMediaProvider,
  ) {}

  get current(): MediaStorageProvider {
    return this.forKey(this.config.get('MEDIA_PROVIDER', { infer: true }))
  }

  forKey(key: string): MediaStorageProvider {
    switch (key) {
      case 'cloudinary':
        return this.cloudinary
      case 's3':
        return this.s3
      case 'disk':
        return this.disk
      default:
        throw new ServiceUnavailableException('Unknown stored media provider')
    }
  }
}
