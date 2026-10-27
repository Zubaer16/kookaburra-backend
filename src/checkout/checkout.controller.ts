import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { CheckoutEstimateDto, CheckoutEstimateResponseDto, PutCheckoutRateDto } from './checkout.dto'
import { CheckoutOwnerGuard } from './checkout.owner.guard'
import { CheckoutService } from './checkout.service'

@ApiTags('Checkout / Customer')
@ApiBearerAuth('access-token')
@Controller('checkout')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiUnauthorizedResponse({ description: 'Customer JWT required' })
@ApiForbiddenResponse({ description: 'Not a customer account' })
export class CheckoutCustomerController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read-only live checkout estimate for a configured country/currency; no stock hold or payment' })
  @ApiOkResponse({ type: CheckoutEstimateResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid ISO country code / unknown request fields' })
  @ApiConflictResponse({ description: 'Empty, unavailable or mixed-currency cart; quote changed' })
  @ApiUnprocessableEntityResponse({ description: 'No enabled configured country/currency shipping and tax policy' })
  estimate(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutEstimateDto) {
    return this.checkout.estimate(req.authUser!.id, dto)
  }
}

@ApiTags('Checkout / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/checkout/rates')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
@ApiUnauthorizedResponse({ description: 'Admin bearer JWT required' })
@ApiForbiddenResponse({ description: 'Only OWNER may manage checkout rate policies' })
export class CheckoutAdminController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get()
  @ApiOperation({ summary: 'List explicitly configured country/currency shipping and tax estimate policies (OWNER)' })
  @ApiOkResponse({ description: 'Configured rate policies; no secret values' })
  list() { return this.checkout.listRates() }

  @Put()
  @ApiOperation({ summary: 'Idempotently configure one country/currency shipping/tax estimate lane (OWNER)' })
  @ApiOkResponse({ description: 'Persisted rate policy' })
  @ApiBadRequestResponse({ description: 'Invalid rates, money bounds, tax basis points or unsupported fields' })
  put(@Req() req: AuthenticatedRequest, @Body() dto: PutCheckoutRateDto) {
    return this.checkout.putRate(dto, req.authUser!.id)
  }
}
