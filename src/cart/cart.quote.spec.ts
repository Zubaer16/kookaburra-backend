import { calculateCartQuote, QuoteInputLine } from './cart.quote'

const line = (overrides: Partial<QuoteInputLine> = {}): QuoteInputLine => ({
  id: 'line-1',
  productId: 'product-1',
  variantId: null,
  quantity: 2,
  product: {
    title: 'T-shirt',
    sku: 'TS-1',
    status: 'ACTIVE',
    currency: 'USD',
    priceMinor: 1250,
    hasVariants: false,
    inventoryBalance: { onHand: 4 },
  },
  variant: null,
  ...overrides,
})

describe('04A live cart quote (no price or stock trust from client)', () => {
  it('returns empty and non-checkout-ready for a missing cart', () => {
    const result = calculateCartQuote(null, [])
    expect(result.checkoutReady).toBe(false)
    expect(result.amountDueMinor).toBeNull()
    expect(result.currency).toBeNull()
    expect(result.items).toEqual([])
  })
  it('prices from product in integer minor units; never reports payable total', () => {
    const result = calculateCartQuote('cart-1', [line()])
    expect(result.checkoutReady).toBe(true)
    expect(result.subtotalMinor).toBe(2500)
    expect(result.items[0]).toMatchObject({
      status: 'AVAILABLE',
      unitPriceMinor: 1250,
      lineTotalMinor: 2500,
    })
    expect(result.amountDueMinor).toBeNull()
  })
  it('marks stock shortage and draft/archived product without a payable amount', () => {
    const low = calculateCartQuote('cart-1', [line({ quantity: 5 })])
    expect(low.checkoutReady).toBe(false)
    expect(low.items[0]).toMatchObject({ status: 'OUT_OF_STOCK' })
    expect(low.subtotalMinor).toBe(0)
    const archived = calculateCartQuote('cart-1', [
      line({ product: { ...line().product, status: 'ARCHIVED' } }),
    ])
    expect(archived.items[0]).toMatchObject({ status: 'UNPUBLISHED' })
  })
  it('rejects a variant that does not belong and respects variant-specific price/stock', () => {
    const product = { ...line().product, hasVariants: true }
    const valid = calculateCartQuote('cart-1', [
      line({
        product,
        variantId: 'v1',
        variant: {
          id: 'v1',
          productId: 'product-1',
          sku: 'V1',
          priceMinor: 1700,
          inventoryBalance: { onHand: 2 },
        },
      }),
    ])
    expect(valid.items[0]).toMatchObject({
      status: 'AVAILABLE',
      unitPriceMinor: 1700,
      availableQuantity: 2,
    })
    const invalid = calculateCartQuote('cart-1', [
      line({
        product,
        variantId: 'v1',
        variant: {
          id: 'v1',
          productId: 'other-product',
          sku: 'BAD',
          priceMinor: 1700,
          inventoryBalance: { onHand: 20 },
        },
      }),
    ])
    expect(invalid.items[0]).toMatchObject({ status: 'VARIANT_INVALID' })
    expect(invalid.checkoutReady).toBe(false)
  })
  it('does not create a mixed-currency payable quote even for legacy rows', () => {
    const mixed = calculateCartQuote('cart-1', [
      line(),
      line({
        id: 'line-2',
        productId: 'p2',
        product: { ...line().product, currency: 'BDT' },
      }),
    ])
    expect(mixed.checkoutReady).toBe(false)
    expect(mixed.items[1]).toMatchObject({ status: 'CURRENCY_MISMATCH' })
    expect(mixed.amountDueMinor).toBeNull()
  })
})
