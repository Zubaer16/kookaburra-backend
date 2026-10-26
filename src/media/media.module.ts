import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogWriteGuard } from '../catalog/catalog.write.guard'
import { MediaController } from './media.controller'
import { MediaService } from './media.service'
import { CloudinaryMediaProvider } from './storage'
import { S3MediaProvider } from './s3.storage'
import { DiskMediaProvider } from './disk.storage'
import { DiskMediaController } from './disk.controller'
import { MediaStorageRegistry } from './storage.registry'
import { MediaCdnPurgeService } from './cdn-purge.service'

@Module({
  imports: [AuthModule],
  controllers: [MediaController, DiskMediaController],
  providers: [
    MediaService,
    CloudinaryMediaProvider,
    S3MediaProvider,
    DiskMediaProvider,
    MediaStorageRegistry,
    MediaCdnPurgeService,
    CatalogWriteGuard,
  ],
  exports: [MediaService],
})
export class MediaModule {}
