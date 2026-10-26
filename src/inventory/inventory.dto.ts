import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

const MAX_INT = 2_147_483_647

export class InventoryQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Items with onHand <= lowStockThreshold',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  lowStock?: 'true' | 'false'

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Lookup simple-product balance or variant balances of this product',
  })
  @IsOptional()
  @IsUUID()
  productId?: string

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lookup one variant balance, optionally with productId',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string
}

export class MovementQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export enum AdjustmentReason {
  RECEIPT = 'RECEIPT',
  RETURN = 'RETURN',
  DAMAGE = 'DAMAGE',
  CORRECTION = 'CORRECTION',
}

export class AdjustInventoryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Client-generated idempotency key. Use same UUID on retries.',
  })
  @IsUUID()
  requestId!: string

  @ApiProperty({
    type: 'integer',
    minimum: -MAX_INT,
    maximum: MAX_INT,
    example: 10,
    description: 'Signed units; must be nonzero',
  })
  @IsInt()
  @Min(-MAX_INT)
  @Max(MAX_INT)
  @NotEquals(0)
  delta!: number

  @ApiProperty({ enum: AdjustmentReason })
  @IsIn(Object.values(AdjustmentReason))
  reason!: AdjustmentReason

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class SetLowStockThresholdDto {
  @ApiProperty({ type: 'integer', minimum: 0, maximum: MAX_INT, example: 5 })
  @IsInt()
  @Min(0)
  @Max(MAX_INT)
  lowStockThreshold!: number
}
