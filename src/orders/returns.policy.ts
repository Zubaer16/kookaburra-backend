/** A pending, unapproved return may be withdrawn by its original customer.
 * Approval, physical inspection and any replacement remain terminal to this action.
 */
export function canWithdrawPendingReturn(status: string): boolean {
  return status === 'REQUESTED'
}
