import { estimateConfiguredCharges } from './checkout.pricing'

describe('04B-1 configured checkout estimate arithmetic', () => {
  it('keeps integer minor units; tax applies to subtotal only', () => {
    expect(estimateConfiguredCharges(1299, 500, null, 750)).toEqual({
      shippingMinor: 500,
      taxMinor: 97,
      estimatedTotalMinor: 1896,
    })
  })
  it('uses inclusive free-shipping threshold and rounds tax half up', () => {
    expect(estimateConfiguredCharges(100, 999, 100, 500)).toEqual({
      shippingMinor: 0, taxMinor: 5, estimatedTotalMinor: 105,
    })
    expect(estimateConfiguredCharges(1, 0, null, 5000).taxMinor).toBe(1)
    expect(estimateConfiguredCharges(0, 250, null, 1000).estimatedTotalMinor).toBe(250)
  })
  it('fails closed on amount overflow and inconsistent config', () => {
    expect(() => estimateConfiguredCharges(2147483647, 100, null, 200)).toThrow()
    expect(() => estimateConfiguredCharges(-1, 100, null, 0)).toThrow()
    expect(() => estimateConfiguredCharges(100, 100, null, 10001)).toThrow()
  })
})
