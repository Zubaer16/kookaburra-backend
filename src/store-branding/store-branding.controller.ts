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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CheckoutOwnerGuard } from '../checkout/checkout.owner.guard'
import {
  AdminStoreBrandingDto,
  PublicStoreBrandingDto,
  PutStoreBrandingDto,
} from './store-branding.dto'
import { StoreBrandingService } from './store-branding.service'

@ApiTags('Store Branding / Public')
@Controller('store/branding')
export class PublicStoreBrandingController {
  constructor(private readonly branding: StoreBrandingService) {}
  @Get()
  @ApiOperation({
    summary:
      'Public verified logo/favicon URLs resolved from Media Library IDs',
  })
  @ApiOkResponse({ type: PublicStoreBrandingDto })
  get() {
    return this.branding.publicBranding()
  }
}

@ApiTags('Store Branding / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Staff JWT required' })
@ApiForbiddenResponse({ description: 'Only OWNER may manage store branding' })
@Controller('admin/store/branding')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
export class AdminStoreBrandingController {
  constructor(private readonly branding: StoreBrandingService) {}
  @Get()
  @ApiOperation({
    summary: 'OWNER reads verified media branding and current revision',
  })
  @ApiOkResponse({ type: AdminStoreBrandingDto })
  get() {
    return this.branding.adminBranding()
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'OWNER atomically binds verified logo/favicon media IDs; rejects stale revision',
  })
  @ApiOkResponse({ type: AdminStoreBrandingDto })
  @ApiBadRequestResponse({
    description: 'Malformed media UUID or unexpected field',
  })
  @ApiConflictResponse({
    description: 'Stale revision, unverified image or unavailable asset',
  })
  put(@Req() req: AuthenticatedRequest, @Body() dto: PutStoreBrandingDto) {
    return this.branding.save(dto, req.authUser!.id)
  }
}
