import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

// Plain text only. Preserve newline/tab in policies, but never accept HTML or controls.
const safePlainText = /^[^<>\x00-\x08\x0b\x0c\x0e-\x1f]*$/

export class PutStoreContentDto {
  @ApiProperty({
    minimum: 0,
    description:
      '0 means no content saved; send the latest revision to avoid lost updates',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number

  @ApiProperty({
    maxLength: 70,
    description: 'Plain-text browser/SEO title; empty string clears',
  })
  @IsString()
  @MaxLength(70)
  @Matches(safePlainText)
  seoTitle!: string

  @ApiProperty({
    maxLength: 180,
    description: 'Plain-text SEO meta description; empty string clears',
  })
  @IsString()
  @MaxLength(180)
  @Matches(safePlainText)
  seoDescription!: string

  @ApiProperty({
    maxLength: 240,
    description: 'Plain-text store footer statement; empty string clears',
  })
  @IsString()
  @MaxLength(240)
  @Matches(safePlainText)
  footerText!: string

  @ApiProperty({
    maxLength: 10000,
    description: 'Plain-text privacy policy; no HTML, empty string clears',
  })
  @IsString()
  @MaxLength(10000)
  @Matches(safePlainText)
  privacyPolicy!: string

  @ApiProperty({
    maxLength: 10000,
    description: 'Plain-text terms of service; no HTML, empty string clears',
  })
  @IsString()
  @MaxLength(10000)
  @Matches(safePlainText)
  termsOfService!: string

  @ApiProperty({
    maxLength: 10000,
    description: 'Plain-text returns policy; no HTML, empty string clears',
  })
  @IsString()
  @MaxLength(10000)
  @Matches(safePlainText)
  returnPolicy!: string
}

export class PublicStoreContentDto {
  @ApiProperty() configured!: boolean
  @ApiProperty() seoTitle!: string
  @ApiProperty() seoDescription!: string
  @ApiProperty() footerText!: string
  @ApiProperty() privacyPolicy!: string
  @ApiProperty() termsOfService!: string
  @ApiProperty() returnPolicy!: string
}

export class AdminStoreContentDto extends PublicStoreContentDto {
  @ApiProperty({ minimum: 0 }) revision!: number
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  updatedAt!: string | null
}
