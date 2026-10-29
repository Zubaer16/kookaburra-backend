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
import {
  ReplacementActionDto,
  ReplacementResponseDto,
  ShipReplacementDto,
} from './replacements.dto'
import { ReplacementsService } from './replacements.service'

@ApiTags('Replacements / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/orders/:id/replacements')
@UseGuards(AccessGuard, AdminGuard, FulfillmentManageGuard)
@ApiUnauthorizedResponse({ description: 'Admin JWT required' })
@ApiForbiddenResponse({ description: 'orders.manage permission required' })
export class ReplacementsAdminController {
  constructor(private readonly replacements: ReplacementsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List separate, non-financial replacement dispatch records for order',
  })
  @ApiOkResponse({ type: ReplacementResponseDto, isArray: true })
  list(@Param('id', ParseUUIDPipe) orderId: string) {
    return this.replacements.adminList(orderId)
  }

  @Post('returns/:returnId/authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Authorize one same-SKU replacement after physical inspection; NO stock reservation, refund or restock',
  })
  @ApiOkResponse({ type: ReplacementResponseDto })
  @ApiConflictResponse({
    description:
      'Return not inspected, existing replacement, or financial refund conflict',
  })
  authorize(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Param('returnId', ParseUUIDPipe) returnId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReplacementActionDto,
  ) {
    return this.replacements.authorize(orderId, returnId, req.authUser!.id, dto)
  }

  @Post(':replacementId/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Atomically deduct available original SKU once and ship replacement; original paid order unchanged',
  })
  @ApiOkResponse({ type: ReplacementResponseDto })
  @ApiConflictResponse({
    description:
      'Insufficient unreserved stock, SKU mismatch, wrong state or reused request UUID',
  })
  ship(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Param('replacementId', ParseUUIDPipe) replacementId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ShipReplacementDto,
  ) {
    return this.replacements.ship(orderId, replacementId, req.authUser!.id, dto)
  }

  @Post(':replacementId/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record delivery of dispatched replacement (no stock or finance changes)',
  })
  @ApiOkResponse({ type: ReplacementResponseDto })
  deliver(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Param('replacementId', ParseUUIDPipe) replacementId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReplacementActionDto,
  ) {
    return this.replacements.deliver(
      orderId,
      replacementId,
      req.authUser!.id,
      dto,
    )
  }

  @Post(':replacementId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel authorization BEFORE replacement dispatch; never undo a shipped stock movement',
  })
  @ApiOkResponse({ type: ReplacementResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Param('replacementId', ParseUUIDPipe) replacementId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReplacementActionDto,
  ) {
    return this.replacements.cancel(
      orderId,
      replacementId,
      req.authUser!.id,
      dto,
    )
  }
}

@ApiTags('Replacements / Customer')
@ApiBearerAuth('access-token')
@Controller('orders/:id/replacements')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiUnauthorizedResponse({ description: 'Customer JWT required' })
@ApiForbiddenResponse({ description: 'CUSTOMER role required' })
export class ReplacementsCustomerController {
  constructor(private readonly replacements: ReplacementsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Read replacement/tracking status for own order; never public tracking lookup',
  })
  @ApiOkResponse({ type: ReplacementResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Order not owned by customer' })
  list(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.replacements.customerList(orderId, req.authUser!.id)
  }
}
