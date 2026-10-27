import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CartService } from './cart.service'
import { CustomerCartGuard } from './cart.customer.guard'
import { CartQuoteResponseDto, SetCartItemDto } from './cart.dto'

@ApiTags('Cart / Customer')
@Controller('cart')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT bearer token' })
@ApiForbiddenResponse({ description: 'Not a customer account' })
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({
    summary:
      'Read persisted customer cart with live quote; no stock reservation',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  get(@Req() req: AuthenticatedRequest) {
    return this.cart.getQuote(req.authUser!.id)
  }

  @Get('quote')
  @ApiOperation({
    summary:
      'Recalculate price, currency, publication and inventory from authoritative DB',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  quote(@Req() req: AuthenticatedRequest) {
    return this.cart.getQuote(req.authUser!.id)
  }

  @Put('items')
  @ApiBadRequestResponse({
    description: 'Invalid quantity, UUID, or variant selection',
  })
  @ApiConflictResponse({
    description:
      'Unpublished product, insufficient stock, currency mismatch or cart full',
  })
  @ApiOperation({
    summary:
      'Set absolute line quantity (idempotent); price/stock never accepted from client',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  put(@Req() req: AuthenticatedRequest, @Body() input: SetCartItemDto) {
    return this.cart.setItem(req.authUser!.id, input)
  }

  @Delete('items/:id')
  @ApiNotFoundResponse({
    description: 'Item does not exist in this customer cart',
  })
  @ApiOperation({
    summary: 'Remove only an item owned by authenticated customer',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cart.removeItem(req.authUser!.id, id)
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the authenticated customer cart' })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  clear(@Req() req: AuthenticatedRequest) {
    return this.cart.clear(req.authUser!.id)
  }
}
