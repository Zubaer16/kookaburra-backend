import {
  Body,
  Controller,
  Get,
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
  ApiForbiddenResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { RefundLedgerService } from './refund-ledger.service'
import {
  CreateRefundRequestDto,
  RefundRequestResponseDto,
} from './refund-ledger.dto'
import { CheckoutOwnerGuard } from '../checkout/checkout.owner.guard'

@ApiTags('Payments / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/payments/orders')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
@ApiUnauthorizedResponse({ description: 'Admin JWT required' })
@ApiForbiddenResponse({ description: 'OWNER role required' })
export class RefundLedgerOwnerController {
  constructor(private readonly refunds: RefundLedgerService) {}

  @Post(':orderId/refunds')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'OWNER-only refund amount reservation; ledger ONLY, no Stripe refund or stock return',
  })
  @ApiOkResponse({ type: RefundRequestResponseDto })
  @ApiConflictResponse({
    description:
      'Not PAID, mismatched idempotency replay, or amount exceeds remaining refund ceiling',
  })
  create(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: CreateRefundRequestDto,
  ) {
    return this.refunds.create(req.authUser!.id, orderId, body)
  }

  @Get(':orderId/refunds')
  @ApiOperation({
    summary:
      'OWNER-only refund request ledger for one order; no raw provider PII',
  })
  @ApiOkResponse({ type: [RefundRequestResponseDto] })
  list(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.refunds.listForOwner(orderId)
  }
}

@ApiTags('Payments / Customer')
@ApiBearerAuth('access-token')
@Controller('payments/orders')
@UseGuards(AccessGuard, CustomerCartGuard)
export class RefundLedgerCustomerController {
  constructor(private readonly refunds: RefundLedgerService) {}

  @Get(':orderId/refunds')
  @ApiOperation({
    summary:
      'Read refund request status for own order; does not initiate a refund',
  })
  @ApiOkResponse({ type: [RefundRequestResponseDto] })
  list(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.refunds.listForCustomer(req.authUser!.id, orderId)
  }
}
