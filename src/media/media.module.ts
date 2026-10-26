import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogWriteGuard } from '../catalog/catalog.write.guard'
import { MediaController } from './media.controller'
import { MediaService } from './media.service'
import { CloudinaryMediaProvider } from './storage'
import { S3MediaProvider } from './s3.storage'
import { MediaStorageRegistry } from './storage.registry'

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [
    MediaService, CloudinaryMediaProvider, S3MediaProvider, MediaStorageRegistry, CatalogWriteGuard,
  ],
  exports: [MediaService],
})
export class MediaModule {}
