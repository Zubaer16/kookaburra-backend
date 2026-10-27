export type QuoteInputLine = {
  id: string
  productId: string
  variantId: string | null
  quantity: number
  product: {
    title: string
    sku: string | null
    status: string
    currency: string
    priceMinor: number
    hasVariants: boolean
    inventoryBalance: { onHand: number } | null
  }
  variant: {
    id: string
    productId: string
    sku: string
    priceMinor: number | null
    inventoryBalance: { onHand: number } | null
  } | null
}

/** Pure live quote projector. The cart never persists prices or stock as truth. */
export function calculateCartQuote(
  cartId: string | null,
  items: QuoteInputLine[],
) {
  const currency = items[0]?.product.currency ?? null
  const issues: string[] = []
  let subtotalMinor = 0
  const lines = items.map((item) => {
    const product = item.product
    const variant = item.variant
    const validVariant = product.hasVariants
      ? !!variant &&
        variant.productId === item.productId &&
        item.variantId === variant.id
      : item.variantId === null
    const price =
      validVariant &&
      variant?.priceMinor !== null &&
      variant?.priceMinor !== undefined
        ? variant.priceMinor
        : product.priceMinor
    const availableQuantity = validVariant
      ? product.hasVariants
        ? (variant?.inventoryBalance?.onHand ?? 0)
        : (product.inventoryBalance?.onHand ?? 0)
      : 0
    let status = 'AVAILABLE'
    if (product.status !== 'ACTIVE') status = 'UNPUBLISHED'
    else if (!validVariant) status = 'VARIANT_INVALID'
    else if (currency !== product.currency) status = 'CURRENCY_MISMATCH'
    else if (availableQuantity < item.quantity) status = 'OUT_OF_STOCK'
    const lineTotalMinor = price * item.quantity
    if (status !== 'AVAILABLE') issues.push(`${item.id}:${status}`)
    else subtotalMinor += lineTotalMinor
    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      title: product.title,
      sku: variant?.sku ?? product.sku,
      quantity: item.quantity,
      availableQuantity,
      unitPriceMinor: price,
      lineTotalMinor,
      currency: product.currency,
      status,
    }
  })
  const checkoutReady = lines.length > 0 && issues.length === 0
  return {
    cartId,
    items: lines,
    currency,
    subtotalMinor,
    // Subtotal excludes tax/shipping: never advertise it as a payable amount.
    amountDueMinor: null,
    checkoutReady,
    issues,
    quotedAt: new Date().toISOString(),
  }
}
