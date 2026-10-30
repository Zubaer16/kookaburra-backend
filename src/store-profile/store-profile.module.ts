import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  AdminStoreProfileController,
  PublicStoreProfileController,
} from './store-profile.controller'
import { StoreProfileService } from './store-profile.service'

@Module({
  imports: [AuthModule],
  controllers: [PublicStoreProfileController, AdminStoreProfileController],
  providers: [StoreProfileService],
})
export class StoreProfileModule {}
