import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogWriteGuard } from '../catalog/catalog.write.guard'
import { MediaController } from './media.controller'
import { MediaService } from './media.service'
import { CloudinaryMediaProvider } from './storage'

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, CloudinaryMediaProvider, CatalogWriteGuard],
  exports: [MediaService],
})
export class MediaModule {}
