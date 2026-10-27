import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  CheckoutCustomerController,
  CheckoutAdminController,
} from './checkout.controller'
import { CheckoutService } from './checkout.service'
import { CheckoutOwnerGuard } from './checkout.owner.guard'
import { CustomerCartGuard } from '../cart/cart.customer.guard'

@Module({
  imports: [AuthModule],
  controllers: [CheckoutCustomerController, CheckoutAdminController],
  providers: [CheckoutService, CheckoutOwnerGuard, CustomerCartGuard],
})
export class CheckoutModule {}
