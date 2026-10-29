import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator'

export class CredentialsDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string
}
export class RefreshDto {
  @ApiProperty({
    description: 'Opaque refresh token; rotate on every refresh.',
    writeOnly: true,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  refreshToken!: string
}
export class SafeUserDto {
  @ApiProperty() id!: string
  @ApiProperty() email!: string
  @ApiProperty() role!: string
  @ApiPropertyOptional({
    description:
      'Resolved persisted Admin workspace role, e.g. CATALOG_EDITOR. Null for customers.',
  })
  staffRole?: string | null
  @ApiPropertyOptional({
    type: [String],
    description:
      'Effective permissions from DB; do not trust browser local previews.',
  })
  permissions?: string[]
}
export class TokenPairDto {
  @ApiProperty() accessToken!: string
  @ApiProperty() refreshToken!: string
  @ApiProperty() tokenType!: string
  @ApiProperty() expiresIn!: number
  @ApiProperty({ type: SafeUserDto }) user!: SafeUserDto
}

/** Authenticated customer self-service only. No email/role updates. */
export class ChangePasswordDto {
  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  currentPassword!: string

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string
}

export class PasswordChangedDto {
  @ApiProperty({ example: true }) changed!: boolean
  @ApiProperty({ example: true }) sessionsRevoked!: boolean
}

/** Opaque action token received via trusted email link; never returned by request API. */
export class EmailVerificationConfirmDto {
  @ApiProperty({
    description: 'Opaque one-time verification token, received out of band',
    writeOnly: true,
    minLength: 40,
    maxLength: 128,
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{40,128}$/)
  token!: string
}
export class EmailVerificationResultDto {
  @ApiProperty({ example: true }) accepted!: boolean
}
