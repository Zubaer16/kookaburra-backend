import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { WishlistController } from './wishlist.controller'
import { WishlistService } from './wishlist.service'

@Module({
  imports: [AuthModule],
  controllers: [WishlistController],
  providers: [WishlistService, CustomerCartGuard],
})
export class WishlistModule {}
