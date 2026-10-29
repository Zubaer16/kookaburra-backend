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
import { ReplacementsService } from './replacements.service'
import {
  ReplacementsAdminController,
  ReplacementsCustomerController,
} from './replacements.controller'

@Module({
  imports: [AuthModule],
  controllers: [
    OrdersCustomerController,
    FulfillmentAdminController,
    ReturnsCustomerController,
    ReturnsAdminController,
    ReplacementsAdminController,
    ReplacementsCustomerController,
  ],
  providers: [
    OrdersService,
    CustomerCartGuard,
    FulfillmentService,
    FulfillmentManageGuard,
    ReturnsService,
    ReplacementsService,
  ],
})
export class OrdersModule {}
