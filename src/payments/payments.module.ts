import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import {
  PaymentCustomerController,
  PaymentWebhookController,
} from './payments.controller'
import { PaymentsService } from './payments.service'
import { StripeTestGateway } from './stripe-gateway'
import { PaymentSettlementService } from './payment-settlement.service'
import { PaymentCancellationService } from './payment-cancellation.service'

@Module({
  imports: [AuthModule],
  controllers: [PaymentCustomerController, PaymentWebhookController],
  providers: [
    PaymentsService,
    StripeTestGateway,
    PaymentSettlementService,
    PaymentCancellationService,
    CustomerCartGuard,
  ],
})
export class PaymentsModule {}
