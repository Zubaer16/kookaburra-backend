import { presentCatalogProduct, presentPage } from './catalog.presentation'

describe('A2 API read projection (additive; no checkout authority)', () => {
  const sample = () => ({
    id: 'product-id',
    title: 'Shirt',
    slug: 'shirt',
    status: 'ACTIVE',
    priceMinor: 2500,
    currency: 'USD',
    compareAtMinor: 3000,
    hasVariants: true,
    stockOnHand: 0,
    categories: [{ categoryId: 'a' }, { categoryId: 'b' }],
    variants: [
      { id: 'v1', stockOnHand: 2, priceMinor: null },
      { id: 'v2', stockOnHand: 0, priceMinor: 2700 },
    ],
  })
  it('exposes category IDs, money, variant override and availability without losing existing fields', () => {
    const result = presentCatalogProduct(sample())
    expect(result.title).toBe('Shirt')
    expect(result.categoryIds).toEqual(['a', 'b'])
    expect(result.price).toEqual({ amountMinor: 2500, currency: 'USD' })
    expect(result.compareAt).toEqual({ amountMinor: 3000, currency: 'USD' })
    expect(result.variants[0]?.price.amountMinor).toBe(2500)
    expect(result.variants[1]?.price.amountMinor).toBe(2700)
    expect(result.variants.map((v) => v.available)).toEqual([true, false])
    // The read projection must preserve variant-specific fields such as `id`
    // while exposing its additional typed availability and effective price.
    expect(result.variants.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(result.purchasable).toBe(true)
  })
  it('rejects checkout-purchasable representation for archived and out-of-stock products', () => {
    expect(
      presentCatalogProduct({ ...sample(), status: 'ARCHIVED' }).purchasable,
    ).toBe(false)
    expect(
      presentCatalogProduct({ ...sample(), variants: [] }).purchasable,
    ).toBe(false)
  })
  it('retains old pagination properties and adds pageSize alias', () => {
    expect(presentPage(['x'], 5, 2, 1)).toEqual({
      items: ['x'],
      total: 5,
      page: 2,
      limit: 1,
      pageSize: 1,
      pages: 5,
    })
  })
  it('returns an ordered verified gallery while withholding pending and deleted images', () => {
    const product = sample()
    const result = presentCatalogProduct({
      ...product,
      media: [
        {
          mediaId: 'unverified',
          altText: 'hidden',
          position: 0,
          media: {
            id: 'unverified',
            status: 'PENDING_UPLOAD',
            publicUrl: 'https://example.com/unsafe',
            width: 1,
            height: 1,
          },
        },
        {
          mediaId: 'second',
          altText: 'Back',
          position: 1,
          media: {
            id: 'second',
            status: 'ACTIVE',
            publicUrl: 'https://res.cloudinary.com/demo/image/upload/back.jpg',
            width: 400,
            height: 300,
          },
        },
        {
          mediaId: 'first',
          altText: 'Front',
          position: 0,
          media: {
            id: 'first',
            status: 'ACTIVE',
            publicUrl: 'https://res.cloudinary.com/demo/image/upload/front.jpg',
            width: 400,
            height: 300,
          },
        },
      ],
    })
    expect(result.image).toContain('front.jpg')
    expect(result.gallery.map((x) => x.id)).toEqual(['first', 'second'])
    expect(result.images).toEqual(result.gallery)
    expect(result.gallery[0]?.alt).toBe('Front')
    expect(result).not.toHaveProperty('providerAssetId')
  })
})
