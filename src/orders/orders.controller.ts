import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { CreateOrderDto, OrderQueryDto, OrderResponseDto } from './orders.dto'
import { OrdersService } from './orders.service'

@ApiTags('Orders / Customer')
@ApiBearerAuth('access-token')
@Controller('orders')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiUnauthorizedResponse({ description: 'Customer JWT required' })
@ApiForbiddenResponse({
  description: 'Only CUSTOMER accounts may access orders',
})
export class OrdersCustomerController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Idempotently convert a live owned reservation into an unpaid order allocation; no payment or physical stock deduction',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid UUID/address or client-supplied monetary data',
  })
  @ApiConflictResponse({
    description: 'Expired/used reservation, country mismatch, or request reuse',
  })
  @ApiNotFoundResponse({
    description: 'Reservation does not belong to customer',
  })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOrderDto) {
    return this.orders.create(req.authUser!.id, dto)
  }

  @Get()
  @ApiOperation({
    summary: 'List own unpaid, cancelled and expired order snapshots',
  })
  list(@Req() req: AuthenticatedRequest, @Query() query: OrderQueryDto) {
    return this.orders.list(req.authUser!.id, query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read own immutable order snapshot' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({
    description: 'Order not found or not owned by customer',
  })
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.get(req.authUser!.id, id)
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Idempotently cancel own pending order and release its stock allocation (no refund/payment)',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({
    description: 'Order not found or not owned by customer',
  })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancel(req.authUser!.id, id)
  }
}
