import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { CatalogWriteGuard } from './catalog.write.guard'

const context = (role: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ authUser: { role } }) }),
  }) as unknown as ExecutionContext

describe('Catalog write authorization', () => {
  const guard = new CatalogWriteGuard()
  it('allows OWNER and ADMIN', () => {
    expect(guard.canActivate(context('OWNER'))).toBe(true)
    expect(guard.canActivate(context('ADMIN'))).toBe(true)
  })
  it('denies CUSTOMER and STAFF writes', () => {
    for (const role of ['CUSTOMER', 'STAFF']) {
      expect(() => guard.canActivate(context(role))).toThrow(ForbiddenException)
    }
  })
})
