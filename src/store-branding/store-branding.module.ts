import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  AdminStoreBrandingController,
  PublicStoreBrandingController,
} from './store-branding.controller'
import { StoreBrandingService } from './store-branding.service'

@Module({
  imports: [AuthModule],
  controllers: [PublicStoreBrandingController, AdminStoreBrandingController],
  providers: [StoreBrandingService],
  exports: [StoreBrandingService],
})
export class StoreBrandingModule {}
