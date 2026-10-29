import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class AdminCustomersQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 10000, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page: number = 1

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20

  @ApiPropertyOptional({
    description: 'Case-insensitive email/display-name substring',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'Search must contain a visible character' })
  search?: string

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED'
}

export class AdminCustomerRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'email' }) email!: string
  @ApiProperty() displayName!: string
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] }) status!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
  @ApiProperty() orderCount!: number
  @ApiProperty({ format: 'date-time', nullable: true })
  lastOrderAt!: Date | null
}

export class AdminCustomersPageDto {
  @ApiProperty({ type: [AdminCustomerRowDto] }) items!: AdminCustomerRowDto[]
  @ApiProperty() total!: number
  @ApiProperty() page!: number
  @ApiProperty() limit!: number
}

export class AdminCustomerRecentOrderDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() status!: string
  @ApiProperty({ format: 'date-time' }) createdAt!: Date
}

export class AdminCustomerDetailDto extends AdminCustomerRowDto {
  @ApiProperty() savedAddressCount!: number
  @ApiProperty({ type: [AdminCustomerRecentOrderDto] })
  recentOrders!: AdminCustomerRecentOrderDto[]
}
