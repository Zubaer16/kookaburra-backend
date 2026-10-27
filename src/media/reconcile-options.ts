/** Destructive storage operations are never performed by reconciliation.
 * All DB changes require the explicit --apply flag.
 */
export function parseMediaReconcileOptions(args: string[]): {
  apply: boolean
  limit: number
} {
  let apply = false
  let limit = 50
  for (const arg of args) {
    if (arg === '--apply') {
      if (apply) throw new Error('Duplicate --apply flag')
      apply = true
      continue
    }
    if (arg.startsWith('--limit=')) {
      const value = arg.slice('--limit='.length)
      if (!/^[1-9][0-9]*$/.test(value))
        throw new Error('Expected --limit=1..100')
      limit = Number(value)
      if (!Number.isSafeInteger(limit) || limit > 100)
        throw new Error('Expected --limit=1..100')
      continue
    }
    throw new Error(`Unknown media reconciliation option: ${arg}`)
  }
  return { apply, limit }
}
