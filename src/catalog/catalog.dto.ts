import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger'

const MONEY_MAX = 2_147_483_647

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string

  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(160)
  slug!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string

  @ApiPropertyOptional({
    example: '#EAF0FF',
    description: 'Navigation tile color, six-digit hex',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 1000000, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  sortOrder?: number

  @ApiPropertyOptional({
    default: true,
    description: 'Category navigation visibility; does not unpublish products',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class VariantOptionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  size?: string
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string
}
export class CreateVariantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sku!: string
  @ApiProperty({ type: VariantOptionsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => VariantOptionsDto)
  options!: VariantOptionsDto
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  priceMinor?: number | null
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  stockOnHand?: number
}
export class UpdateVariantDto extends PartialType(
  OmitType(CreateVariantDto, ['stockOnHand'] as const),
) {}

export enum CatalogProductTag {
  NEW = 'new',
  POPULAR = 'popular',
  SALE = 'sale',
}
export enum CatalogProductSort {
  NEWEST = 'newest',
  PRICE_ASC = 'price-asc',
  PRICE_DESC = 'price-desc',
}
export enum CatalogStockFilter {
  TRUE = 'true',
  FALSE = 'false',
}
export enum CatalogProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  title!: string
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(200)
  slug!: string
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sku!: string
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string
  @ApiPropertyOptional({
    maxLength: 80,
    description: 'Optional merchandising badge label',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  badge?: string
  @ApiPropertyOptional({ enum: CatalogProductTag })
  @IsOptional()
  @IsEnum(CatalogProductTag)
  tag?: CatalogProductTag | null
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CatalogProductStatus)
  status?: CatalogProductStatus
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  priceMinor!: number
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  compareAtMinor?: number | null
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  stockOnHand?: number
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  categoryIds!: string[]
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[]
}
/** Variant changes are separate endpoints to avoid replacing existing variants by accident. */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['stockOnHand', 'variants'] as const),
) {}
export class ProductQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  category?: string
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CatalogProductStatus)
  status?: CatalogProductStatus
  @ApiPropertyOptional({ enum: CatalogProductTag })
  @IsOptional()
  @IsEnum(CatalogProductTag)
  tag?: CatalogProductTag
  @ApiPropertyOptional({
    enum: CatalogProductSort,
    default: CatalogProductSort.NEWEST,
  })
  @IsOptional()
  @IsEnum(CatalogProductSort)
  sort?: CatalogProductSort
  @ApiPropertyOptional({ enum: CatalogStockFilter })
  @IsOptional()
  @IsEnum(CatalogStockFilter)
  inStock?: CatalogStockFilter
  @ApiPropertyOptional({ minimum: 0, maximum: MONEY_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  minPriceMinor?: number
  @ApiPropertyOptional({ minimum: 0, maximum: MONEY_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MONEY_MAX)
  maxPriceMinor?: number
}
