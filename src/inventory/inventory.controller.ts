import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { InventoryWriteGuard } from './inventory.write.guard'
import {
  AdjustInventoryDto,
  InventoryQueryDto,
  MovementQueryDto,
  SetLowStockThresholdDto,
} from './inventory.dto'
import { InventoryService } from './inventory.service'

@ApiTags('Inventory / Admin')
@ApiBearerAuth('access-token')
@Controller('admin/inventory')
@UseGuards(AccessGuard, AdminGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Returns canonical balance IDs, productId/variantId and pageSize alias for Admin inventory adapters',
  })
  @ApiOperation({
    summary:
      'List active SKU balances, optionally by productId or variantId; STAFF may read',
  })
  list(@Query() query: InventoryQueryDto) {
    return this.inventory.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one SKU stock balance' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.get(id)
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'Paginated append-only movements for one SKU' })
  movements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MovementQueryDto,
  ) {
    return this.inventory.movements(id, query)
  }

  @Patch(':id/threshold')
  @UseGuards(InventoryWriteGuard)
  @ApiOperation({
    summary: 'Set low-stock threshold; inventory.adjust permission',
  })
  threshold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SetLowStockThresholdDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.threshold(id, input, req.authUser!.id)
  }

  @Post(':id/adjustments')
  @UseGuards(InventoryWriteGuard)
  @ApiOperation({
    summary: 'Atomic, idempotent stock adjustment; inventory.adjust permission',
  })
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AdjustInventoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.adjust(id, input, req.authUser!.id)
  }
}
