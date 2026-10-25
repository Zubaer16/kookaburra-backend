import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'
import {
  permissionKeys,
  staffRoleKeys,
  PermissionKey,
  StaffRoleKey,
} from './permissions'

const assignableRoles = staffRoleKeys.filter((role) => role !== 'OWNER')
export class RolePermissionUpdateDto {
  @ApiProperty({
    enum: [...permissionKeys],
    isArray: true,
    example: ['dashboard.view', 'catalog.manage'],
  })
  @IsArray()
  @ArrayMaxSize(permissionKeys.length)
  @ArrayUnique()
  @IsIn(permissionKeys, { each: true })
  permissions!: PermissionKey[]
}
export class StaffCreateDto {
  @ApiProperty({ example: 'Store Operator' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string
  @ApiProperty({ example: 'operator@example.test' })
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
  @ApiProperty({ enum: assignableRoles }) @IsIn(assignableRoles) role!: Exclude<
    StaffRoleKey,
    'OWNER'
  >
}
export enum StaffStatusDto {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}
export class StaffUpdateDto {
  @ApiPropertyOptional()
  @ValidateIf((_obj, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name?: string
  @ApiPropertyOptional({ enum: assignableRoles })
  @ValidateIf((_obj, value: unknown) => value !== undefined)
  @IsIn(assignableRoles)
  role?: Exclude<StaffRoleKey, 'OWNER'>
  @ApiPropertyOptional({ enum: StaffStatusDto })
  @ValidateIf((_obj, value: unknown) => value !== undefined)
  @IsEnum(StaffStatusDto)
  status?: StaffStatusDto
}
export class StaffResponseDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty() email!: string
  @ApiProperty() role!: string
  @ApiProperty({ enum: StaffStatusDto }) status!: string
  @ApiProperty() createdAt!: Date
}
export class RoleResponseDto {
  @ApiProperty() key!: string
  @ApiProperty() name!: string
  @ApiProperty({ type: [String] }) permissions!: string[]
  @ApiProperty() immutable!: boolean
}
