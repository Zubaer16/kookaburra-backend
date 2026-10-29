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
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { FulfillmentManageGuard } from './fulfillment.guard'
import {
  CreateOrderReturnDto,
  OrderReturnResponseDto,
  ReceiveReturnDto,
  ReturnActionDto,
} from './returns.dto'
import { ReturnsService } from './returns.service'

@ApiTags('Returns / Customer')
@ApiBearerAuth('access-token')
@Controller('orders/:id/returns')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiUnauthorizedResponse({ description: 'Customer authentication required' })
@ApiForbiddenResponse({ description: 'Only CUSTOMER role allowed' })
export class ReturnsCustomerController {
  constructor(private readonly returns: ReturnsService) {}
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Request return of delivered PAID order line; no refund or stock change',
  })
  @ApiOkResponse({ type: OrderReturnResponseDto })
  @ApiConflictResponse({
    description: 'Return quantity exceeds sold units or order not delivered',
  })
  request(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateOrderReturnDto,
  ) {
    return this.returns.request(req.authUser!.id, id, body)
  }
  @Get()
  @ApiOperation({ summary: 'List own returns and inspection/restock status' })
  @ApiOkResponse({ type: OrderReturnResponseDto, isArray: true })
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.returns.customerList(req.authUser!.id, id)
  }
}

@ApiTags('Returns / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/orders/:id/returns')
@UseGuards(AccessGuard, AdminGuard, FulfillmentManageGuard)
@ApiUnauthorizedResponse({ description: 'Admin authentication required' })
@ApiForbiddenResponse({ description: 'orders.manage permission required' })
export class ReturnsAdminController {
  constructor(private readonly returns: ReturnsService) {}
  @Get()
  @ApiOperation({ summary: 'Read a paid order return ledger' })
  @ApiOkResponse({ type: OrderReturnResponseDto, isArray: true })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.adminList(id)
  }

  @Post(':returnId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve customer request; financial refund remains separate',
  })
  @ApiOkResponse({ type: OrderReturnResponseDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: ReturnActionDto,
  ) {
    return this.returns.approve(id, returnId, req.authUser!.id, body)
  }

  @Post(':returnId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject pending return request and release its quantity allowance',
  })
  @ApiOkResponse({ type: OrderReturnResponseDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: ReturnActionDto,
  ) {
    return this.returns.reject(id, returnId, req.authUser!.id, body)
  }

  @Post(':returnId/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record physically received item condition; does not restock',
  })
  @ApiOkResponse({ type: OrderReturnResponseDto })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: ReceiveReturnDto,
  ) {
    return this.returns.receive(id, returnId, req.authUser!.id, body)
  }

  @Post(':returnId/restock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Restock verified original SKU once after RESTOCKABLE inspection; no refund',
  })
  @ApiOkResponse({ type: OrderReturnResponseDto })
  @ApiConflictResponse({
    description: 'Original SKU changed or return not restockable',
  })
  restock(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: ReturnActionDto,
  ) {
    return this.returns.restock(id, returnId, req.authUser!.id, body)
  }
}
