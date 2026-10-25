import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { hashPassword } from './password'
import { StaffCreateDto, StaffUpdateDto } from './workspace.dto'
import { defaultStaffRole } from './permissions'

@Injectable()
export class WorkspaceService {
  constructor(private readonly database: DatabaseService) {}

  async listStaff() {
    const rows = await this.database.client.user.findMany({
      where: { role: { in: ['OWNER', 'ADMIN', 'STAFF'] } },
      include: { staffRoleAssignment: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((u) => ({
      id: u.id,
      name: u.displayName,
      email: u.email,
      role: u.staffRoleAssignment?.roleKey ?? defaultStaffRole(u.role),
      status: u.status,
      createdAt: u.createdAt,
    }))
  }

  async createStaff(input: StaffCreateDto, actorId: string) {
    const email = input.email.trim().toLowerCase()
    if (await this.database.client.user.findUnique({ where: { email } }))
      throw new ConflictException('Account already exists')
    const passwordHash = await hashPassword(input.password)
    try {
      const created = await this.database.client.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            displayName: input.name.trim(),
            passwordHash,
            role: input.role === 'MANAGER' ? 'ADMIN' : 'STAFF',
            staffRoleAssignment: { create: { roleKey: input.role } },
          },
        })
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'rbac.staff.create',
            targetType: 'user',
            targetId: user.id,
          },
        })
        return user
      })
      return {
        id: created.id,
        email: created.email,
        name: created.displayName,
        role: input.role,
        status: created.status,
        createdAt: created.createdAt,
      }
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err &&
        'code' in err &&
        err.code === 'P2002'
      )
        throw new ConflictException('Account already exists')
      throw err
    }
  }

  async updateStaff(id: string, input: StaffUpdateDto, actorId: string) {
    const existing = await this.database.client.user.findUnique({
      where: { id },
      include: { staffRoleAssignment: true },
    })
    if (!existing || existing.role === 'CUSTOMER')
      throw new NotFoundException('Staff not found')
    if (existing.role === 'OWNER')
      throw new ForbiddenException(
        'Owner account is immutable through staff API',
      )
    if (id === actorId && input.status === 'DISABLED')
      throw new ForbiddenException('Cannot disable yourself')
    return this.database.client.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { displayName: input.name.trim() }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.role !== undefined && {
            role: input.role === 'MANAGER' ? 'ADMIN' : 'STAFF',
          }),
        },
      })
      if (input.role !== undefined) {
        await tx.staffRoleAssignment.upsert({
          where: { userId: id },
          update: { roleKey: input.role },
          create: { userId: id, roleKey: input.role },
        })
      }
      // Old access tokens are checked against the DB on each request; disabling
      // or demoting staff therefore takes effect immediately.
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'rbac.staff.update',
          targetType: 'user',
          targetId: id,
        },
      })
      return {
        id: updated.id,
        email: updated.email,
        name: updated.displayName,
        role:
          input.role ??
          existing.staffRoleAssignment?.roleKey ??
          defaultStaffRole(updated.role),
        status: updated.status,
        createdAt: updated.createdAt,
      }
    })
  }
}
