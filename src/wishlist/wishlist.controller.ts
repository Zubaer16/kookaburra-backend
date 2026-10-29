import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import {
  WishlistMergeDto,
  WishlistRemoveResponseDto,
  WishlistResponseDto,
} from './wishlist.dto'
import { WishlistService } from './wishlist.service'

@ApiTags('Wishlist / Customer')
@Controller('wishlist')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Valid customer bearer JWT required' })
@ApiForbiddenResponse({ description: 'Customer account required' })
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({
    summary:
      'List customer-owned bookmarks; only currently published products are projected',
  })
  @ApiOkResponse({ type: WishlistResponseDto })
  list(@Req() req: AuthenticatedRequest) {
    return this.wishlist.list(req.authUser!.id)
  }

  @Post('merge')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Idempotently merge canonical product UUIDs after login (local preview IDs must be mapped explicitly)',
  })
  @ApiOkResponse({ type: WishlistResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid IDs, duplicate IDs, or extra fields',
  })
  @ApiNotFoundResponse({
    description: 'One or more products are not currently published',
  })
  @ApiConflictResponse({ description: 'Wishlist size limit reached' })
  merge(@Req() req: AuthenticatedRequest, @Body() body: WishlistMergeDto) {
    return this.wishlist.merge(req.authUser!.id, body.productIds)
  }

  @Put(':productId')
  @ApiOperation({
    summary: 'Idempotently bookmark a published product by canonical UUID',
  })
  @ApiOkResponse({ type: WishlistResponseDto })
  @ApiNotFoundResponse({ description: 'Product not published or not found' })
  @ApiConflictResponse({ description: 'Wishlist size limit reached' })
  add(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.wishlist.add(req.authUser!.id, productId)
  }

  @Delete(':productId')
  @ApiOperation({
    summary: 'Remove a customer-owned bookmark; retries are harmless',
  })
  @ApiOkResponse({ type: WishlistRemoveResponseDto })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.wishlist.remove(req.authUser!.id, productId)
  }
}
