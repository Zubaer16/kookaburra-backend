/** Additive read-model: legacy persistence fields remain unchanged.
 * The English-only frontends map title/description strings to {en: ...}.
 * Do NOT invent media URLs: image fields arrive with Phase 03C.
 */
export type CatalogProductRecord = {
  status: string
  priceMinor: number
  currency: string
  compareAtMinor: number | null
  stockOnHand: number
  hasVariants: boolean
  categories: Array<{ categoryId: string }>
  variants: Array<{ stockOnHand: number; priceMinor: number | null }>
  media?: Array<{
    mediaId: string
    altText: string
    position: number
    media: {
      id: string
      status: string
      publicUrl: string | null
      width: number
      height: number
    }
  }>
}

type CatalogPresentedVariant<
  V extends CatalogProductRecord['variants'][number],
> = V & {
  available: boolean
  price: { amountMinor: number; currency: string }
}

export function presentCatalogProduct<T extends CatalogProductRecord>(
  product: T,
) {
  // Destructure variants before the object spread: spreading generic T and then
  // overwriting T.variants can preserve the original array type in TypeScript.
  const { variants, media, ...productFields } = product
  const categoryIds = product.categories.map((item) => item.categoryId)
  const money = (minor: number) => ({
    amountMinor: minor,
    currency: product.currency,
  })
  const gallery = (media ?? [])
    .filter((link) => link.media.status === 'ACTIVE' && !!link.media.publicUrl)
    .sort((a, b) => a.position - b.position)
    .map((link) => ({
      id: link.mediaId,
      src: link.media.publicUrl!,
      url: link.media.publicUrl!,
      alt: link.altText,
      width: link.media.width,
      height: link.media.height,
      position: link.position,
    }))
  const available = product.hasVariants
    ? variants.some((variant) => variant.stockOnHand > 0)
    : product.stockOnHand > 0
  return {
    ...productFields,
    categoryIds,
    // Public URLs are verified provider outputs, never arbitrary client URLs.
    gallery,
    images: gallery,
    image: gallery[0]?.src ?? null,
    price: money(product.priceMinor),
    ...(product.compareAtMinor === null
      ? {}
      : { compareAt: money(product.compareAtMinor) }),
    purchasable: product.status === 'ACTIVE' && available,
    variants: variants.map((variant) => ({
      ...variant,
      available: variant.stockOnHand > 0,
      price: money(variant.priceMinor ?? product.priceMinor),
    })) as Array<CatalogPresentedVariant<T['variants'][number]>>,
  }
}

export function presentPage<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    items,
    total,
    page,
    limit,
    pageSize: limit,
    pages: Math.ceil(total / limit),
  }
}
