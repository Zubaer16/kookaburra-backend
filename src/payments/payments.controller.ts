import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request } from 'express'
import { AccessGuard } from '../auth/access.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import {
  PaymentPreparationResponseDto,
  TestCardCompletionResponseDto,
} from './payments.dto'
import { PaymentTestCompletionService } from './payment-test-completion.service'
import { PaymentsService } from './payments.service'

@ApiTags('Payments / Customer')
@ApiBearerAuth('access-token')
@Controller('payments/orders')
@UseGuards(AccessGuard, CustomerCartGuard)
export class PaymentCustomerController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly testCompletion: PaymentTestCompletionService,
  ) {}

  @Post(':orderId/test-complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Explicitly enabled non-production Stripe TEST card simulation; no raw card data; signed webhook settlement still required',
  })
  @ApiOkResponse({ type: TestCardCompletionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Customer JWT required' })
  testComplete(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.testCompletion.complete(req.authUser!.id, id)
  }

  @Post(':orderId/prepare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Prepare Stripe TEST intent; never returns client_secret, never captures/settles payment',
  })
  @ApiOkResponse({ type: PaymentPreparationResponseDto })
  @ApiConflictResponse({
    description:
      'Order expired, pending preparation, or requires manual reconciliation',
  })
  @ApiUnauthorizedResponse({ description: 'Customer JWT required' })
  prepare(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.payments.prepare(req.authUser!.id, id)
  }

  @Get(':orderId')
  @ApiOperation({
    summary:
      'Read owned test payment preparation status, or null if not prepared',
  })
  @ApiOkResponse({ type: PaymentPreparationResponseDto })
  get(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.payments.get(req.authUser!.id, id)
  }
}

@ApiTags('Payments / Webhooks')
@Controller('payments/stripe')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept raw-body, HMAC-verified Stripe TEST event once; receipt ONLY, no order/payment settlement',
  })
  @ApiOkResponse({
    description: 'Signed Stripe test event received and durably deduplicated',
  })
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.payments.receiveWebhook(req.rawBody, signature)
  }
}
