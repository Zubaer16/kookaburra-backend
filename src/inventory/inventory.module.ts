import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CatalogWriteGuard } from '../catalog/catalog.write.guard'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, CatalogWriteGuard],
})
export class InventoryModule {}
