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
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import {
  FulfillmentActionDto,
  FulfillmentOrderQueryDto,
  FulfillmentShipDto,
  OrderFulfillmentResponseDto,
} from './fulfillment.dto'
import { FulfillmentManageGuard } from './fulfillment.guard'
import { FulfillmentService } from './fulfillment.service'
import { OrdersService } from './orders.service'
import { OrderResponseDto } from './orders.dto'

@ApiTags('Orders / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/orders')
@UseGuards(AccessGuard, AdminGuard, FulfillmentManageGuard)
@ApiUnauthorizedResponse({ description: 'Admin JWT required' })
@ApiForbiddenResponse({ description: 'orders.manage permission required' })
export class FulfillmentAdminController {
  constructor(
    private readonly fulfillment: FulfillmentService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Paginated order list for permitted staff; payment status and fulfillment are separate',
  })
  list(@Query() query: FulfillmentOrderQueryDto) {
    return this.fulfillment.list(query)
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Read order and its shipment (one shipment per order in 04D-1)',
  })
  @ApiNotFoundResponse({ description: 'Order not found' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.fulfillment.get(id)
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Idempotently cancel unpaid order (or expire overdue order) and release its allocation; never cancel paid orders or issue refunds',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiConflictResponse({
    description:
      'Paid or financially in-flight order cannot be cancelled via unpaid-order action',
  })
  @ApiNotFoundResponse({ description: 'Order not found' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orders.adminCancel(id, req.authUser!.id)
  }

  @Post(':id/fulfillment/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start processing a verified PAID order (idempotent UUID)',
  })
  @ApiOkResponse({ type: OrderFulfillmentResponseDto })
  @ApiConflictResponse({
    description: 'Unpaid, refunded or already processing',
  })
  @ApiBadRequestResponse({ description: 'Invalid UUID or input fields' })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: FulfillmentActionDto,
  ) {
    return this.fulfillment.start(id, req.authUser!.id, dto)
  }

  @Post(':id/fulfillment/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark processing order shipped with carrier and tracking number',
  })
  @ApiOkResponse({ type: OrderFulfillmentResponseDto })
  @ApiConflictResponse({
    description: 'Not processing, unverified payment or refund review',
  })
  ship(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: FulfillmentShipDto,
  ) {
    return this.fulfillment.ship(id, req.authUser!.id, dto)
  }

  @Post(':id/fulfillment/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark shipped order delivered, idempotently' })
  @ApiOkResponse({ type: OrderFulfillmentResponseDto })
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: FulfillmentActionDto,
  ) {
    return this.fulfillment.deliver(id, req.authUser!.id, dto)
  }
}
