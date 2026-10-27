import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CartController } from './cart.controller'
import { CartService } from './cart.service'
import { CustomerCartGuard } from './cart.customer.guard'

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService, CustomerCartGuard],
})
export class CartModule {}
