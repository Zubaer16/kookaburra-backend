import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator'

export class FulfillmentActionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'One UUID per transition, reused on retry',
  })
  @IsUUID()
  requestId!: string
}

export class FulfillmentShipDto extends FulfillmentActionDto {
  @ApiProperty({ example: 'UPS', maxLength: 80 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._&-]{1,79}$/)
  carrier!: string

  @ApiProperty({ example: 'TRACK123456', maxLength: 120 })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/)
  trackingNumber!: string
}

export class FulfillmentOrderQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}

export class OrderFulfillmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ enum: ['PROCESSING', 'SHIPPED', 'DELIVERED'] }) status!: string
  @ApiPropertyOptional({ type: String, nullable: true }) carrier!: string | null
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNumber!:
    | string
    | null
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  shippedAt!: Date | null
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null
}
