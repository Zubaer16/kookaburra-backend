import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
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
import type { AuthenticatedRequest } from '../auth/auth.types'
import { PermissionsService } from '../auth/permissions.service'
import {
  AdminCustomerDetailDto,
  AdminCustomersPageDto,
  AdminCustomersQueryDto,
} from './customers.dto'
import { CustomersService } from './customers.service'

@ApiTags('Customers / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Valid staff access token required' })
@ApiForbiddenResponse({ description: 'customers.view permission required' })
@Controller('admin/customers')
@UseGuards(AccessGuard, AdminGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Paginated, permission-gated customer directory (no secrets)',
  })
  @ApiOkResponse({ type: AdminCustomersPageDto })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: AdminCustomersQueryDto,
  ) {
    this.permissions.assert(req.authUser!, 'customers.view')
    return this.customers.list(query)
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Customer account overview and five most recent order statuses',
  })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiNotFoundResponse({
    description: 'Customer not found (staff accounts not exposed)',
  })
  detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.permissions.assert(req.authUser!, 'customers.view')
    return this.customers.detail(id)
  }
}
