import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogService } from './catalog.service'
import { CatalogWriteGuard } from './catalog.write.guard'
import {
  StorefrontCatalogController,
  AdminCatalogController,
} from './catalog.controller'

@Module({
  imports: [AuthModule],
  controllers: [StorefrontCatalogController, AdminCatalogController],
  providers: [CatalogService, CatalogWriteGuard],
})
export class CatalogModule {}
