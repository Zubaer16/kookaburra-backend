import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { InventoryWriteGuard } from './inventory.write.guard'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryWriteGuard],
})
export class InventoryModule {}
