import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiSecurity,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request } from 'express'
import {
  CartQuoteResponseDto,
  GuestCartCreatedDto,
  SetCartItemDto,
} from './cart.dto'
import { GuestCartService } from './guest-cart.service'

/** The capability remains an HTTP header. Reading through @Req() avoids
 * generating a duplicate OpenAPI header *parameter* beside the API-key
 * security scheme, which causes Swagger UI to block Execute.
 */
function guestCapability(request: Request): string {
  return request.get('X-Guest-Cart-Token') ?? ''
}

/** Guest capability != JWT; no ability to call customer/admin endpoints. */
@ApiTags('Cart / Guest')
@Controller('guest-cart')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, expired or consumed guest cart capability',
})
export class GuestCartController {
  constructor(private readonly guest: GuestCartService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create anonymous cart; returns one-time 256-bit capability (never use in URL)',
  })
  @ApiCreatedResponse({ type: GuestCartCreatedDto })
  create() {
    return this.guest.create()
  }

  @Get()
  @ApiSecurity('guest-cart-token')
  @ApiOkResponse({ type: CartQuoteResponseDto })
  get(@Req() request: Request) {
    return this.guest.getQuote(guestCapability(request))
  }

  @Get('quote')
  @ApiSecurity('guest-cart-token')
  @ApiOkResponse({ type: CartQuoteResponseDto })
  quote(@Req() request: Request) {
    return this.guest.getQuote(guestCapability(request))
  }

  @Put('items')
  @ApiSecurity('guest-cart-token')
  @ApiBadRequestResponse({
    description: 'Invalid product, variant or quantity',
  })
  @ApiConflictResponse({
    description: 'Stock unavailable, mixed currency or 50-line cap',
  })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  put(@Req() request: Request, @Body() input: SetCartItemDto) {
    return this.guest.setItem(guestCapability(request), input)
  }

  @Delete('items/:id')
  @ApiSecurity('guest-cart-token')
  @ApiNotFoundResponse({ description: 'Line not found in this guest cart' })
  @ApiOkResponse({ type: CartQuoteResponseDto })
  remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.guest.removeItem(guestCapability(request), id)
  }

  @Delete('items')
  @ApiSecurity('guest-cart-token')
  @ApiOkResponse({ type: CartQuoteResponseDto })
  clear(@Req() request: Request) {
    return this.guest.clear(guestCapability(request))
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('guest-cart-token')
  @ApiOperation({
    summary: 'Revoke anonymous cart capability and delete its items',
  })
  @ApiOkResponse({ description: 'Guest capability revoked' })
  revoke(@Req() request: Request) {
    return this.guest.revoke(guestCapability(request))
  }
}
