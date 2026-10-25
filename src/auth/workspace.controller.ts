import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from './access.guard'
import { AdminGuard } from './admin.guard'
import { AuthenticatedRequest } from './auth.types'
import { PermissionsService } from './permissions.service'
import { WorkspaceService } from './workspace.service'
import {
  RolePermissionUpdateDto,
  RoleResponseDto,
  StaffCreateDto,
  StaffResponseDto,
  StaffUpdateDto,
} from './workspace.dto'
import { staffRoleKeys, StaffRoleKey } from './permissions'

@ApiTags('Workspace / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing/invalid JWT' })
@ApiForbiddenResponse({
  description:
    'Requires staff.manage; OWNER privileges cannot be delegated by client input',
})
@Controller('admin')
@UseGuards(AccessGuard, AdminGuard)
export class WorkspaceController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly workspace: WorkspaceService,
  ) {}
  private requireOwner(req: AuthenticatedRequest) {
    // Staff roster and RBAC policy mutation are owner-controlled in v1.
    // This prevents a mutable permission grant from granting its own ability
    // to escalate all other roles.
    if (req.authUser?.role !== 'OWNER')
      throw new ForbiddenException(
        'Owner required to manage staff and role grants',
      )
  }

  @Get('roles')
  @ApiOperation({
    summary:
      'List persistent workspace roles and grants (staff.manage / OWNER)',
  })
  @ApiOkResponse({ type: RoleResponseDto, isArray: true })
  roles(@Req() req: AuthenticatedRequest) {
    this.requireOwner(req)
    return this.permissions.roles()
  }
  @Patch('roles/:key/permissions')
  @ApiOperation({
    summary:
      'Replace persisted role permissions; OWNER only, Owner role immutable',
  })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiBody({ type: RolePermissionUpdateDto })
  rolePermissions(
    @Param('key') key: string,
    @Body() body: RolePermissionUpdateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireOwner(req)
    if (!(staffRoleKeys as readonly string[]).includes(key))
      throw new BadRequestException('Unknown staff role')
    return this.permissions.updateRolePermissions(
      key as StaffRoleKey,
      body.permissions,
      req.authUser!.id,
    )
  }
  @Get('staff')
  @ApiOperation({
    summary: 'List staff with persistent role keys and status; OWNER only',
  })
  @ApiOkResponse({ type: StaffResponseDto, isArray: true })
  staff(@Req() req: AuthenticatedRequest) {
    this.requireOwner(req)
    return this.workspace.listStaff()
  }
  @Post('staff')
  @ApiOperation({
    summary: 'Create staff account; OWNER only; cannot create OWNER',
  })
  @ApiCreatedResponse({ type: StaffResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  createStaff(@Body() body: StaffCreateDto, @Req() req: AuthenticatedRequest) {
    this.requireOwner(req)
    return this.workspace.createStaff(body, req.authUser!.id)
  }
  @Patch('staff/:id')
  @ApiOperation({
    summary:
      'Change staff name, status or role; OWNER only; changes effective immediately',
  })
  @ApiOkResponse({ type: StaffResponseDto })
  updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StaffUpdateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireOwner(req)
    return this.workspace.updateStaff(id, body, req.authUser!.id)
  }
}
