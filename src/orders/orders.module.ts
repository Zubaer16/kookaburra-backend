import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { OrdersCustomerController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [AuthModule],
  controllers: [OrdersCustomerController],
  providers: [OrdersService, CustomerCartGuard],
})
export class OrdersModule {}
