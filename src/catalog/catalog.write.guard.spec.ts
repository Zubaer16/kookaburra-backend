import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { CatalogWriteGuard } from './catalog.write.guard'

const context = (role: string, permissions: string[] = []): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ authUser: { role, permissions } }),
    }),
  }) as unknown as ExecutionContext

describe('Catalog write authorization uses live resolved permissions', () => {
  const guard = new CatalogWriteGuard()
  it('allows OWNER or a role with catalog.manage', () => {
    expect(guard.canActivate(context('OWNER'))).toBe(true)
    expect(guard.canActivate(context('ADMIN', ['catalog.manage']))).toBe(true)
    expect(guard.canActivate(context('STAFF', ['catalog.manage']))).toBe(true)
  })
  it('denies staff without permission and customers', () => {
    const deniedCases: Array<[string, string[]]> = [
      ['STAFF', ['dashboard.view']],
      ['ADMIN', []],
      ['CUSTOMER', []],
    ]
    for (const [role, permissions] of deniedCases) {
      expect(() => guard.canActivate(context(role, permissions))).toThrow(
        ForbiddenException,
      )
    }
  })
})
