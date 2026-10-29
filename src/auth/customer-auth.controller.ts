import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { AccessGuard } from './access.guard'
import { AuthenticatedRequest } from './auth.types'
import {
  ChangePasswordDto,
  PasswordChangedDto,
  CredentialsDto,
  RefreshDto,
  SafeUserDto,
  TokenPairDto,
} from './auth.dto'

@ApiTags('Authentication / Customer')
@Controller('auth')
export class CustomerAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register customer (email verification is not yet implemented)',
  })
  @ApiCreatedResponse({ type: TokenPairDto })
  register(@Body() dto: CredentialsDto): Promise<TokenPairDto> {
    return this.auth.register(dto)
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() dto: CredentialsDto): Promise<TokenPairDto> {
    return this.auth.login(dto)
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshDto): Promise<TokenPairDto> {
    return this.auth.refresh(dto)
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a presented refresh token' })
  logout(@Body() dto: RefreshDto): Promise<{ loggedOut: boolean }> {
    return this.auth.logout(dto)
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Authenticated customer changes password, revoking existing sessions',
    description:
      'Requires current password. All prior access/refresh tokens are invalidated; sign in again.',
  })
  @ApiOkResponse({ type: PasswordChangedDto })
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<PasswordChangedDto> {
    // Guard authenticates; service checks role again inside DB transaction.
    return this.auth.changePassword(req.authUser!.id, dto)
  }

  @Get('me')
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: SafeUserDto })
  me(@Req() req: AuthenticatedRequest): SafeUserDto {
    return req.authUser!
  }
}
