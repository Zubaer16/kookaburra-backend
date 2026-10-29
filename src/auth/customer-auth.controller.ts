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
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { AccessGuard } from './access.guard'
import { AuthenticatedRequest } from './auth.types'
import {
  ChangePasswordDto,
  EmailVerificationConfirmDto,
  EmailVerificationResultDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  PasswordResetRequestResultDto,
  PasswordResetCompleteDto,
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
    summary:
      'Register customer (verification delivery becomes available in G7)',
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

  @Post('email-verification/request')
  @HttpCode(202)
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Request email verification for the signed-in customer',
    description:
      'Queues an AES-GCM encrypted delivery event (G7 email sender pending). Never returns the token; 60-second resend cooldown.',
  })
  @ApiAcceptedResponse({ type: EmailVerificationResultDto })
  requestEmailVerification(
    @Req() req: AuthenticatedRequest,
  ): Promise<EmailVerificationResultDto> {
    return this.auth.requestEmailVerification(req.authUser!.id)
  }

  @Post('email-verification/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Consume one-time email verification token',
    description:
      '30-minute token expiry. No public token issuance or debug delivery endpoint.',
  })
  @ApiOkResponse({ type: EmailVerificationResultDto })
  @ApiBadRequestResponse({ description: 'Invalid, consumed or expired token' })
  confirmEmailVerification(
    @Body() dto: EmailVerificationConfirmDto,
  ): Promise<EmailVerificationResultDto> {
    return this.auth.confirmEmailVerification(dto)
  }

  @Post('password-reset/request')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request customer password recovery (non-enumerating)',
    description:
      'Always accepted for valid email input. A one-time token is queued encrypted for G7 delivery; no token or account existence is returned.',
  })
  @ApiAcceptedResponse({ type: PasswordResetRequestResultDto })
  requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
  ): Promise<PasswordResetRequestResultDto> {
    return this.auth.requestPasswordReset(dto)
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Consume one-time reset token and revoke previous sessions',
    description:
      '30-minute expiry, single use. Password and session epoch change atomically.',
  })
  @ApiOkResponse({ type: PasswordResetCompleteDto })
  @ApiBadRequestResponse({
    description: 'Invalid, expired or consumed reset token',
  })
  confirmPasswordReset(
    @Body() dto: PasswordResetConfirmDto,
  ): Promise<PasswordResetCompleteDto> {
    return this.auth.confirmPasswordReset(dto)
  }

  @Get('me')
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: SafeUserDto })
  me(@Req() req: AuthenticatedRequest): SafeUserDto {
    return req.authUser!
  }
}
