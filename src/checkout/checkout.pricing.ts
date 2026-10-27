import { ConflictException } from '@nestjs/common'

// Safe integer arithmetic; monetary client values never enter this function.
export function estimateConfiguredCharges(
  subtotalMinor: number,
  shippingMinor: number,
  freeOverSubtotalMinor: number | null,
  taxBps: number,
) {
  if (
    ![subtotalMinor, shippingMinor, taxBps].every(Number.isSafeInteger) ||
    subtotalMinor < 0 ||
    shippingMinor < 0 ||
    taxBps < 0 ||
    taxBps > 10000 ||
    (freeOverSubtotalMinor !== null &&
      (!Number.isSafeInteger(freeOverSubtotalMinor) ||
        freeOverSubtotalMinor < 0))
  )
    throw new ConflictException('Invalid checkout pricing configuration')
  const actualShippingMinor =
    freeOverSubtotalMinor !== null && subtotalMinor >= freeOverSubtotalMinor
      ? 0
      : shippingMinor
  // Nonnegative minor units: round half up to the nearest whole minor unit.
  const taxMinor = Math.floor((subtotalMinor * taxBps + 5000) / 10000)
  const estimatedTotalMinor = subtotalMinor + actualShippingMinor + taxMinor
  if (
    ![taxMinor, estimatedTotalMinor].every(Number.isSafeInteger) ||
    estimatedTotalMinor > 2_147_483_647
  )
    throw new ConflictException('Checkout amount exceeds supported money range')
  return { shippingMinor: actualShippingMinor, taxMinor, estimatedTotalMinor }
}
