// Contract mirrors Admin lib/workspace-policy.ts. Persistent rows are authoritative.
// Never authorize from the Admin's browser-local permission preview.
export const permissionKeys = [
  'dashboard.view',
  'catalog.manage',
  'inventory.adjust',
  'orders.manage',
  'customers.view',
  'marketing.manage',
  'shipping.manage',
  'payments.view',
  'staff.manage',
  'settings.manage',
  'activity.view',
] as const
export type PermissionKey = (typeof permissionKeys)[number]
export const staffRoleKeys = [
  'OWNER',
  'MANAGER',
  'CATALOG_EDITOR',
  'SUPPORT',
  'ANALYST',
] as const
export type StaffRoleKey = (typeof staffRoleKeys)[number]
export const roleDisplayNames: Record<StaffRoleKey, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CATALOG_EDITOR: 'Catalog Editor',
  SUPPORT: 'Support',
  ANALYST: 'Analyst',
}

export function defaultStaffRole(role: string): StaffRoleKey | null {
  if (role === 'OWNER') return 'OWNER'
  if (role === 'ADMIN') return 'MANAGER'
  if (role === 'STAFF') return 'SUPPORT'
  return null
}
export function isPermissionKey(value: string): value is PermissionKey {
  return (permissionKeys as readonly string[]).includes(value)
}
