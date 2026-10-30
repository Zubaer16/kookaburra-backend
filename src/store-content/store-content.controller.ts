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
  AdminStoreContentDto,
  PublicStoreContentDto,
  PutStoreContentDto,
} from './store-content.dto'
import { StoreContentService } from './store-content.service'

@ApiTags('Store Content / Public')
@Controller('store/content')
export class PublicStoreContentController {
  constructor(private readonly content: StoreContentService) {}

  @Get()
  @ApiOperation({
    summary: 'Read published plain-text store SEO, footer and policy content',
  })
  @ApiOkResponse({ type: PublicStoreContentDto })
  get() {
    return this.content.publicContent()
  }
}

@ApiTags('Store Content / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Staff JWT required' })
@ApiForbiddenResponse({ description: 'Only OWNER may manage store content' })
@Controller('admin/store/content')
@UseGuards(AccessGuard, AdminGuard, CheckoutOwnerGuard)
export class AdminStoreContentController {
  constructor(private readonly content: StoreContentService) {}

  @Get()
  @ApiOperation({
    summary:
      'OWNER reads store content, current revision and updated timestamp',
  })
  @ApiOkResponse({ type: AdminStoreContentDto })
  get() {
    return this.content.adminContent()
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'OWNER saves plain-text SEO/footer/policies using optimistic revision; 409 for stale edits',
  })
  @ApiOkResponse({ type: AdminStoreContentDto })
  @ApiBadRequestResponse({
    description: 'Invalid/HTML content or unexpected writable field',
  })
  @ApiConflictResponse({
    description: 'Stale expectedRevision; reload before editing',
  })
  put(@Req() req: AuthenticatedRequest, @Body() dto: PutStoreContentDto) {
    return this.content.save(dto, req.authUser!.id)
  }
}
