import { canWithdrawPendingReturn } from './returns.policy'

describe('G1-4 pending return withdrawal policy', () => {
  it('permits REQUESTED before Admin decision', () => {
    expect(canWithdrawPendingReturn('REQUESTED')).toBe(true)
  })

  it.each([
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'RECEIVED_RESTOCKABLE',
    'RECEIVED_DAMAGED',
    'RESTOCKED',
    'UNKNOWN',
  ])('rejects withdrawal in %s', (status) => {
    expect(canWithdrawPendingReturn(status)).toBe(false)
  })
})
