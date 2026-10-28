import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { OrdersCustomerController } from './orders.controller'
import { OrdersService } from './orders.service'
import { FulfillmentAdminController } from './fulfillment.controller'
import { FulfillmentService } from './fulfillment.service'
import { FulfillmentManageGuard } from './fulfillment.guard'

@Module({
  imports: [AuthModule],
  controllers: [OrdersCustomerController, FulfillmentAdminController],
  providers: [
    OrdersService,
    CustomerCartGuard,
    FulfillmentService,
    FulfillmentManageGuard,
  ],
})
export class OrdersModule {}
