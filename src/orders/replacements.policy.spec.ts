import {
  isInspectedReturn,
  replacementTransitionAllowed,
} from './replacements.policy'

describe('04D-2B-1 non-financial replacement policy', () => {
  it.each(['RECEIVED_DAMAGED', 'RECEIVED_RESTOCKABLE', 'RESTOCKED'])(
    'accepts physical inspection status %s',
    (status) => expect(isInspectedReturn(status)).toBe(true),
  )
  it.each(['REQUESTED', 'APPROVED', 'REJECTED', 'BOGUS'])(
    'never bypasses inspection with %s',
    (status) => expect(isInspectedReturn(status)).toBe(false),
  )
  it('allows only authorize -> ship -> deliver or authorize -> cancel', () => {
    expect(replacementTransitionAllowed('AUTHORIZED', 'SHIP')).toBe(true)
    expect(replacementTransitionAllowed('AUTHORIZED', 'CANCEL')).toBe(true)
    expect(replacementTransitionAllowed('AUTHORIZED', 'DELIVER')).toBe(false)
    expect(replacementTransitionAllowed('SHIPPED', 'DELIVER')).toBe(true)
    expect(replacementTransitionAllowed('SHIPPED', 'CANCEL')).toBe(false)
    expect(replacementTransitionAllowed('SHIPPED', 'SHIP')).toBe(false)
    expect(replacementTransitionAllowed('DELIVERED', 'SHIP')).toBe(false)
    expect(replacementTransitionAllowed('DELIVERED', 'DELIVER')).toBe(false)
    expect(replacementTransitionAllowed('CANCELLED', 'SHIP')).toBe(false)
  })
})
