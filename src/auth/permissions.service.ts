import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import {
  defaultStaffRole,
  isPermissionKey,
  permissionKeys,
  roleDisplayNames,
  StaffRoleKey,
  PermissionKey,
} from './permissions'
import type { UserRole } from '../generated/prisma/enums'

@Injectable()
export class PermissionsService {
  constructor(private readonly database: DatabaseService) {}

  // Persisted role grants are consulted on EVERY protected request. The JWT
  // 'role' claim is intentionally ignored for authorization decisions.
  async resolve(user: { id: string; role: UserRole }): Promise<{
    staffRole: StaffRoleKey | null
    permissions: PermissionKey[]
  }> {
    const assigned = await this.database.client.staffRoleAssignment.findUnique({
      where: { userId: user.id },
      select: { roleKey: true },
    })
    // Defense in depth: the account's coarse role cannot be elevated by a
    // stale assignment when it has been demoted to CUSTOMER.
    if (user.role === 'CUSTOMER') return { staffRole: null, permissions: [] }
    const staffRole = (assigned?.roleKey ??
      defaultStaffRole(user.role)) as StaffRoleKey | null
    if (!staffRole || !(staffRole in roleDisplayNames))
      throw new ForbiddenException('Staff role not configured')
    if (staffRole === 'OWNER' && user.role !== 'OWNER')
      throw new ForbiddenException('Owner authorization mismatch')
    // Owner rights cannot be stripped by a corrupt or incomplete editable role.
    if (user.role === 'OWNER')
      return { staffRole: 'OWNER', permissions: [...permissionKeys] }
    const grants = await this.database.client.staffRolePermission.findMany({
      where: { roleKey: staffRole },
      select: { permissionKey: true },
    })
    return {
      staffRole,
      permissions: grants.map((x) => x.permissionKey).filter(isPermissionKey),
    }
  }

  assert(
    user: { role: UserRole; permissions?: PermissionKey[] },
    permission: PermissionKey,
  ) {
    if (user.role !== 'OWNER' && !user.permissions?.includes(permission)) {
      throw new ForbiddenException(`Permission required: ${permission}`)
    }
  }

  async roles() {
    return this.database.client.staffRole
      .findMany({
        include: { permissions: { select: { permissionKey: true } } },
        orderBy: { key: 'asc' },
      })
      .then((roles) =>
        roles.map((r) => ({
          key: r.key,
          name: r.displayName,
          permissions:
            r.key === 'OWNER'
              ? [...permissionKeys]
              : r.permissions.map((p) => p.permissionKey).sort(),
          immutable: r.key === 'OWNER',
        })),
      )
  }

  async updateRolePermissions(
    roleKey: StaffRoleKey,
    permissions: PermissionKey[],
    actorId: string,
  ) {
    if (roleKey === 'OWNER')
      throw new ForbiddenException('Owner permissions are immutable')
    const known = await this.database.client.staffRole.findUnique({
      where: { key: roleKey },
    })
    if (!known) throw new NotFoundException('Role not found')
    // Transaction serializes role edit and audit; fresh permissions take effect
    // on the *very next* authenticated API request, even with an old JWT.
    await this.database.client.$transaction(async (tx) => {
      await tx.staffRolePermission.deleteMany({ where: { roleKey } })
      if (permissions.length)
        await tx.staffRolePermission.createMany({
          data: permissions.map((permissionKey) => ({
            roleKey,
            permissionKey,
          })),
        })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'rbac.role.permissions.update',
          targetType: 'staff_role',
          targetId: roleKey,
        },
      })
    })
    return {
      key: roleKey,
      name: known.displayName,
      permissions: [...permissions].sort(),
      immutable: false,
    }
  }
}
