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
import { PaymentTestCompletionService } from './payment-test-completion.service'
import { RefundLedgerService } from './refund-ledger.service'
import {
  RefundLedgerOwnerController,
  RefundLedgerCustomerController,
} from './refund-ledger.controller'

@Module({
  imports: [AuthModule],
  controllers: [
    PaymentCustomerController,
    PaymentWebhookController,
    RefundLedgerOwnerController,
    RefundLedgerCustomerController,
  ],
  providers: [
    PaymentsService,
    StripeTestGateway,
    PaymentSettlementService,
    PaymentCancellationService,
    PaymentTestCompletionService,
    RefundLedgerService,
    CustomerCartGuard,
  ],
})
export class PaymentsModule {}
