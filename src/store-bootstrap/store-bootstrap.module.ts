import { Module } from '@nestjs/common'
import { StoreProfileModule } from '../store-profile/store-profile.module'
import { StoreContentModule } from '../store-content/store-content.module'
import { StoreBrandingModule } from '../store-branding/store-branding.module'
import { StoreBootstrapController } from './store-bootstrap.controller'
import { StoreBootstrapService } from './store-bootstrap.service'

@Module({
  imports: [StoreProfileModule, StoreContentModule, StoreBrandingModule],
  controllers: [StoreBootstrapController],
  providers: [StoreBootstrapService],
})
export class StoreBootstrapModule {}
