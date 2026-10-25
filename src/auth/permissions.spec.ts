import {
  defaultStaffRole,
  isPermissionKey,
  permissionKeys,
  roleDisplayNames,
  staffRoleKeys,
} from './permissions'

describe('A1 permissions contract', () => {
  it('uses the five Admin workspace roles and all 11 stable permission keys', () => {
    expect(staffRoleKeys).toEqual([
      'OWNER',
      'MANAGER',
      'CATALOG_EDITOR',
      'SUPPORT',
      'ANALYST',
    ])
    expect(Object.keys(roleDisplayNames).sort()).toEqual(
      [...staffRoleKeys].sort(),
    )
    expect(permissionKeys).toHaveLength(11)
    expect(new Set(permissionKeys).size).toBe(11)
    expect(isPermissionKey('catalog.manage')).toBe(true)
    expect(isPermissionKey('catalog.root')).toBe(false)
  })
  it('preserves legacy coarse-role mapping without inventing staff privileges for customers', () => {
    expect(defaultStaffRole('OWNER')).toBe('OWNER')
    expect(defaultStaffRole('ADMIN')).toBe('MANAGER')
    expect(defaultStaffRole('STAFF')).toBe('SUPPORT')
    expect(defaultStaffRole('CUSTOMER')).toBeNull()
  })
})
