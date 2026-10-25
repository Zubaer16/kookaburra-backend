import type { UserRole } from '../generated/prisma/enums'
import type { StaffRoleKey, PermissionKey } from './permissions'

export type SafeUser = {
  id: string
  email: string
  role: UserRole
  staffRole?: StaffRoleKey | null
  permissions?: PermissionKey[]
}
export type AuthenticatedRequest = {
  headers: { authorization?: string }
  authUser?: SafeUser
}
