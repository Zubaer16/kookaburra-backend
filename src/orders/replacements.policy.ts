/** 04D-2B: refund and inventory actions are deliberately separate. */
export function isInspectedReturn(status: string): boolean {
  return (
    status === 'RECEIVED_DAMAGED' ||
    status === 'RECEIVED_RESTOCKABLE' ||
    status === 'RESTOCKED'
  )
}

export function replacementTransitionAllowed(
  current: string,
  action: 'SHIP' | 'DELIVER' | 'CANCEL',
): boolean {
  return action === 'DELIVER' ? current === 'SHIPPED' : current === 'AUTHORIZED'
}
