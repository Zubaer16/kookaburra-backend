import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEmail,
  IsIn,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'

// Match existing Admin preview options, not a claim about legal/timezone compliance.
export const supportedStoreTimezones = [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Singapore',
  'Australia/Sydney',
] as const

export class PutStoreProfileDto {
  @ApiProperty({ minLength: 2, maxLength: 70 })
  @IsString()
  @MinLength(2)
  @MaxLength(70)
  @Matches(/\S/)
  @Matches(/^[^<>\x00-\x1f]*$/)
  storeName!: string

  @ApiProperty({ format: 'email', maxLength: 120 })
  @IsEmail()
  @MaxLength(120)
  supportEmail!: string

  @ApiProperty({
    example: 'https://example.com',
    description: 'Public HTTPS storefront URL; empty string clears it',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  @ValidateIf((_object, value: unknown) => value !== '')
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_tld: true,
    allow_protocol_relative_urls: false,
  })
  websiteUrl!: string

  @ApiProperty({ enum: supportedStoreTimezones })
  @IsIn(supportedStoreTimezones)
  timezone!: (typeof supportedStoreTimezones)[number]

  @ApiProperty({
    maxLength: 180,
    description: 'Plain-text public support notice; empty string clears it',
  })
  @IsString()
  @MaxLength(180)
  @Matches(/^[^<>\x00-\x1f]*$/)
  supportNotice!: string
}

export class PublicStoreProfileDto {
  @ApiProperty() configured!: boolean
  @ApiPropertyOptional({ type: String, nullable: true }) storeName!:
    | string
    | null
  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  supportEmail!: string | null
  @ApiProperty({ type: String }) websiteUrl!: string
  @ApiPropertyOptional({ type: String, nullable: true }) timezone!:
    | string
    | null
  @ApiProperty({ type: String }) supportNotice!: string
}

export class AdminStoreProfileDto extends PublicStoreProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  updatedAt!: string | null
}
