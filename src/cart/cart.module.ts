import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CartController } from './cart.controller'
import { GuestCartController } from './guest-cart.controller'
import { GuestCartService } from './guest-cart.service'
import { CartService } from './cart.service'
import { CustomerCartGuard } from './cart.customer.guard'

@Module({
  imports: [AuthModule],
  controllers: [CartController, GuestCartController],
  providers: [CartService, CustomerCartGuard, GuestCartService],
})
export class CartModule {}
