import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { FulfillmentManageGuard } from './fulfillment.guard'

function context(actor: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser: actor }) }),
  } as unknown as ExecutionContext
}

describe('04D-1 fulfillment server-side permission gate', () => {
  const guard = new FulfillmentManageGuard()
  it('allows OWNER and server-resolved orders.manage permission', () => {
    expect(guard.canActivate(context({ role: 'OWNER', permissions: [] }))).toBe(
      true,
    )
    expect(
      guard.canActivate(
        context({ role: 'STAFF', permissions: ['orders.manage'] }),
      ),
    ).toBe(true)
  })
  it('rejects missing, customer and staff without orders.manage', () => {
    expect(() => guard.canActivate(context(null))).toThrow(ForbiddenException)
    expect(() =>
      guard.canActivate(context({ role: 'CUSTOMER', permissions: [] })),
    ).toThrow(ForbiddenException)
    expect(() =>
      guard.canActivate(
        context({ role: 'STAFF', permissions: ['shipping.manage'] }),
      ),
    ).toThrow(ForbiddenException)
  })
})
