import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { OrdersCustomerController } from './orders.controller'
import { OrdersService } from './orders.service'
import { FulfillmentAdminController } from './fulfillment.controller'
import { FulfillmentService } from './fulfillment.service'
import { FulfillmentManageGuard } from './fulfillment.guard'
import {
  ReturnsCustomerController,
  ReturnsAdminController,
} from './returns.controller'
import { ReturnsService } from './returns.service'

@Module({
  imports: [AuthModule],
  controllers: [
    OrdersCustomerController,
    FulfillmentAdminController,
    ReturnsCustomerController,
    ReturnsAdminController,
  ],
  providers: [
    OrdersService,
    CustomerCartGuard,
    FulfillmentService,
    FulfillmentManageGuard,
    ReturnsService,
  ],
})
export class OrdersModule {}
