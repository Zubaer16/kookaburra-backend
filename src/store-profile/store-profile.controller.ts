import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { CheckoutOwnerGuard } from '../checkout/checkout.owner.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import {
  AdminStoreProfileDto,
  PublicStoreProfileDto,
  PutStoreProfileDto,
} from './store-profile.dto'
import { StoreProfileService } from './store-profile.service'

@ApiTags('Store Profile / Public')
@Controller('store/profile')
export class PublicStoreProfileController {
  constructor(private readonly profile: StoreProfileService) {}

  @Get()
  @ApiOperation({
    summary:
      'Read safe published store identity/contact settings; unconfigured is explicit',
  })
  @ApiOkResponse({ type: PublicStoreProfileDto })
  publicProfile() {
    return this.profile.publicProfile()
  }
}

@ApiTags('Store Profile / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Staff JWT required' })
@ApiForbiddenResponse({ description: 'OWNER only; no STAFF/ADMIN override' })
@Controller('admin/store/profile')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
export class AdminStoreProfileController {
  constructor(private readonly profile: StoreProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'OWNER reads store profile including updated timestamp',
  })
  @ApiOkResponse({ type: AdminStoreProfileDto })
  adminProfile() {
    return this.profile.adminProfile()
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'OWNER atomically saves identity/contact profile; no checkout/CORS/order-prefix changes',
  })
  @ApiOkResponse({ type: AdminStoreProfileDto })
  @ApiBadRequestResponse({
    description: 'Invalid or additional fields; insecure URL',
  })
  put(@Req() req: AuthenticatedRequest, @Body() dto: PutStoreProfileDto) {
    return this.profile.put(dto, req.authUser!.id)
  }
}
