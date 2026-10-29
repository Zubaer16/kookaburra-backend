import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CustomerProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'email' }) email!: string
  @ApiProperty() displayName!: string
  @ApiProperty({
    description:
      'Email ownership verified using a one-time token; not a login prerequisite yet',
  })
  emailVerified!: boolean
  @ApiProperty({ enum: ['CUSTOMER'] }) role!: 'CUSTOMER'
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class UpdateCustomerProfileDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 120,
    description:
      'Display name only; email/password changes require separately verified flows.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: 'displayName cannot be blank' })
  displayName!: string
}

export class CustomerAddressInputDto {
  @ApiPropertyOptional({ example: 'Home', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/\S/)
  label?: string

  @ApiProperty({ example: 'Alex Sample', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  recipientName!: string

  @ApiProperty({
    example: '+12025550123',
    description: 'E.164 contact number; not a login credential',
  })
  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/)
  phone!: string

  @ApiProperty({ example: '123 Example Street', maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/\S/)
  addressLine1!: string

  @ApiPropertyOptional({ example: 'Apartment 2', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string

  @ApiProperty({ example: 'New York', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  city!: string

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @ApiProperty({
    example: 'US',
    description: 'ISO 3166-1 alpha-2; does not imply an enabled shipping lane',
  })
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string

  @ApiPropertyOptional({
    description:
      'Make this the default address; first address automatically becomes default',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}

export class UpdateCustomerAddressDto extends PartialType(
  CustomerAddressInputDto,
) {}

export class CustomerAddressDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() label!: string
  @ApiProperty() recipientName!: string
  @ApiProperty() phone!: string
  @ApiProperty() addressLine1!: string
  @ApiProperty() addressLine2!: string
  @ApiProperty() city!: string
  @ApiProperty() region!: string
  @ApiProperty() postalCode!: string
  @ApiProperty() countryCode!: string
  @ApiProperty() isDefault!: boolean
  @ApiProperty({ format: 'date-time' }) createdAt!: string
  @ApiProperty({ format: 'date-time' }) updatedAt!: string
}

export class CustomerAddressListDto {
  @ApiProperty({ type: [CustomerAddressDto], maxItems: 10 })
  items!: CustomerAddressDto[]
  @ApiProperty({ maximum: 10 }) count!: number
}

export class CustomerAddressDeleteDto {
  @ApiProperty() deleted!: boolean
}
