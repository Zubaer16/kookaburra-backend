import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
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
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { FulfillmentManageGuard } from './fulfillment.guard'
import { OrderTrackingResponseDto } from './tracking.dto'
import { TrackingService } from './tracking.service'

@ApiTags('Tracking / Customer')
@ApiBearerAuth('access-token')
@Controller('orders/:id/tracking')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiUnauthorizedResponse({ description: 'Customer JWT required' })
@ApiForbiddenResponse({
  description: 'Only CUSTOMER accounts may access tracking',
})
export class TrackingCustomerController {
  constructor(private readonly tracking: TrackingService) {}

  @Get()
  @ApiOperation({
    summary:
      'Track own order UUID, original shipment, returns and replacements; no public lookup',
  })
  @ApiOkResponse({ type: OrderTrackingResponseDto })
  @ApiNotFoundResponse({
    description: 'Order not found or not owned by customer',
  })
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tracking.customerGet(id, req.authUser!.id)
  }
}

@ApiTags('Tracking / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/orders/:id/tracking')
@UseGuards(AccessGuard, AdminGuard, FulfillmentManageGuard)
@ApiUnauthorizedResponse({ description: 'Admin JWT required' })
@ApiForbiddenResponse({ description: 'orders.manage permission required' })
export class TrackingAdminController {
  constructor(private readonly tracking: TrackingService) {}

  @Get()
  @ApiOperation({
    summary:
      'Read PII-free fulfillment/recovery timeline for an order (orders.manage)',
  })
  @ApiOkResponse({ type: OrderTrackingResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.adminGet(id)
  }
}
