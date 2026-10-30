import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  PublicStoreContentController,
  AdminStoreContentController,
} from './store-content.controller'
import { StoreContentService } from './store-content.service'

@Module({
  imports: [AuthModule],
  controllers: [PublicStoreContentController, AdminStoreContentController],
  providers: [StoreContentService],
})
export class StoreContentModule {}
