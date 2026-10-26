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
  const { variants, ...productFields } = product
  const categoryIds = product.categories.map((item) => item.categoryId)
  const money = (minor: number) => ({
    amountMinor: minor,
    currency: product.currency,
  })
  const available = product.hasVariants
    ? variants.some((variant) => variant.stockOnHand > 0)
    : product.stockOnHand > 0
  return {
    ...productFields,
    categoryIds,
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
