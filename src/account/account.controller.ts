import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CustomerCartGuard } from '../cart/cart.customer.guard'
import { AccountService } from './account.service'
import {
  CustomerAddressDeleteDto,
  CustomerAddressDto,
  CustomerAddressInputDto,
  CustomerAddressListDto,
  CustomerProfileDto,
  UpdateCustomerAddressDto,
  UpdateCustomerProfileDto,
} from './account.dto'

@ApiTags('Account / Customer')
@Controller('account')
@UseGuards(AccessGuard, CustomerCartGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Customer access JWT required' })
@ApiForbiddenResponse({
  description: 'Staff cannot access customer account API',
})
export class AccountController {
  constructor(private readonly service: AccountService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Read current customer profile directly from database',
  })
  @ApiOkResponse({ type: CustomerProfileDto })
  profile(@Req() req: AuthenticatedRequest) {
    return this.service.profile(req.authUser!.id)
  }

  @Patch('profile')
  @ApiOperation({
    summary:
      'Edit customer display name only; verified email/password changes are separate',
  })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiBadRequestResponse({
    description: 'Blank name or unknown fields rejected',
  })
  updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.service.updateProfile(req.authUser!.id, dto.displayName)
  }

  @Get('addresses')
  @ApiOperation({
    summary: 'List up to 10 private saved addresses; default first',
  })
  @ApiOkResponse({ type: CustomerAddressListDto })
  listAddresses(@Req() req: AuthenticatedRequest) {
    return this.service.listAddresses(req.authUser!.id)
  }

  @Get('addresses/:addressId')
  @ApiOperation({ summary: 'Read one owned saved address' })
  @ApiOkResponse({ type: CustomerAddressDto })
  @ApiNotFoundResponse({ description: 'Address not found or not owned' })
  getAddress(
    @Req() req: AuthenticatedRequest,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.service.getAddress(req.authUser!.id, addressId)
  }

  @Post('addresses')
  @ApiOperation({
    summary: 'Save a customer-owned address; first becomes default',
  })
  @ApiCreatedResponse({ type: CustomerAddressDto })
  @ApiConflictResponse({ description: '10-address limit reached' })
  createAddress(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CustomerAddressInputDto,
  ) {
    return this.service.createAddress(req.authUser!.id, dto)
  }

  @Patch('addresses/:addressId')
  @ApiOperation({ summary: 'Update owned address or select it as default' })
  @ApiOkResponse({ type: CustomerAddressDto })
  @ApiNotFoundResponse({ description: 'Address not found or not owned' })
  @ApiConflictResponse({
    description: 'Default cannot be unset without assigning a replacement',
  })
  updateAddress(
    @Req() req: AuthenticatedRequest,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.service.updateAddress(req.authUser!.id, addressId, dto)
  }

  @Delete('addresses/:addressId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Delete owned saved address; next oldest becomes default if needed; no order history changes',
  })
  @ApiOkResponse({ type: CustomerAddressDeleteDto })
  @ApiNotFoundResponse({ description: 'Address not found or not owned' })
  deleteAddress(
    @Req() req: AuthenticatedRequest,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ) {
    return this.service.deleteAddress(req.authUser!.id, addressId)
  }
}
