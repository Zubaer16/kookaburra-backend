import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { InventoryWriteGuard } from './inventory.write.guard'
const context = (role: string, permissions: string[] = []): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ authUser: { role, permissions } }),
    }),
  }) as unknown as ExecutionContext

describe('Inventory write permission is distinct from catalog.manage', () => {
  const guard = new InventoryWriteGuard()
  it('allows OWNER and inventory.adjust grants', () => {
    expect(guard.canActivate(context('OWNER'))).toBe(true)
    expect(guard.canActivate(context('STAFF', ['inventory.adjust']))).toBe(true)
  })
  it('denies catalog-only staff and customer', () => {
    expect(() =>
      guard.canActivate(context('STAFF', ['catalog.manage'])),
    ).toThrow(ForbiddenException)
    expect(() => guard.canActivate(context('CUSTOMER'))).toThrow(
      ForbiddenException,
    )
  })
})
