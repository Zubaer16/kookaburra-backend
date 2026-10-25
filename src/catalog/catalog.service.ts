import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantOptionsDto,
} from './catalog.dto'

const productIncludes = {
  variants: true,
  categories: { include: { category: true } },
} as const
const clean = (value: string): string => value.trim()
const requireText = (value: string, field: string): string => {
  const result = clean(value)
  if (!result) throw new BadRequestException(`${field} cannot be blank`)
  return result
}
const normalizedSku = (value: string): string => {
  const sku = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(sku)) {
    throw new BadRequestException(
      'SKU may contain letters, digits, dots, underscores and hyphens',
    )
  }
  return sku
}
const cleanOptions = (
  value: VariantOptionsDto,
): { size?: string; color?: string } => {
  const size = value.size?.trim() || undefined
  const color = value.color?.trim() || undefined
  if (!size && !color)
    throw new BadRequestException('Variant needs a size or color')
  return { ...(size ? { size } : {}), ...(color ? { color } : {}) }
}
const optionKey = (value: { size?: string; color?: string }): string =>
  `${(value.size ?? '').toLowerCase()}|${(value.color ?? '').toLowerCase()}`
const translateDbError = (err: unknown): never => {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? (err as { code: unknown }).code
      : null
  if (code === 'P2002')
    throw new ConflictException('Slug or SKU already exists')
  if (code === 'P2003')
    throw new ConflictException('Cannot delete referenced record')
  if (code === 'P2025') throw new NotFoundException('Record not found')
  throw err
}

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

  async listCategories() {
    return this.database.client.category.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
  }

  async createCategory(input: CreateCategoryDto, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        if (input.parentId) await this.requireCategory(tx, input.parentId)
        const category = await tx.category.create({
          data: {
            name: requireText(input.name, 'Category name'),
            slug: input.slug,
            description: clean(input.description ?? ''),
            parentId: input.parentId || null,
          },
        })
        await this.audit(
          tx,
          actorId,
          'category.created',
          'category',
          category.id,
        )
        return category
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async updateCategory(id: string, input: UpdateCategoryDto, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        await this.requireCategory(tx, id)
        if (input.parentId !== undefined) {
          let cursor = input.parentId
          const visited = new Set([id])
          while (cursor) {
            if (visited.has(cursor))
              throw new ConflictException(
                'Category hierarchy would contain a cycle',
              )
            visited.add(cursor)
            const parent = await this.requireCategory(tx, cursor)
            cursor = parent.parentId
          }
        }
        const category = await tx.category.update({
          where: { id },
          data: {
            ...(input.name !== undefined
              ? { name: requireText(input.name, 'Category name') }
              : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.description !== undefined
              ? { description: clean(input.description) }
              : {}),
            ...(input.parentId !== undefined
              ? { parentId: input.parentId || null }
              : {}),
          },
        })
        await this.audit(tx, actorId, 'category.updated', 'category', id)
        return category
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async deleteCategory(id: string, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        await this.requireCategory(tx, id)
        const [children, links] = await Promise.all([
          tx.category.count({ where: { parentId: id } }),
          tx.productCategory.count({ where: { categoryId: id } }),
        ])
        if (children || links)
          throw new ConflictException(
            'Detach products and child categories first',
          )
        await tx.category.delete({ where: { id } })
        await this.audit(tx, actorId, 'category.deleted', 'category', id)
        return { deleted: true, id }
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async listProducts(query: ProductQueryDto, isAdmin: boolean) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const where: Prisma.ProductWhereInput = {
      ...(isAdmin
        ? query.status
          ? { status: query.status }
          : {}
        : { status: 'ACTIVE' }),
      ...(query.search
        ? {
            title: {
              contains: clean(query.search),
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(query.category
        ? { categories: { some: { category: { slug: query.category } } } }
        : {}),
    }
    const [items, total] = await this.database.client.$transaction([
      this.database.client.product.findMany({
        where,
        include: productIncludes,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.client.product.count({ where }),
    ])
    return { items, total, page, limit, pages: Math.ceil(total / limit) }
  }

  async getPublicProduct(slug: string) {
    const product = await this.database.client.product.findFirst({
      where: { slug, status: 'ACTIVE' },
      include: productIncludes,
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async getAdminProduct(id: string) {
    const product = await this.database.client.product.findUnique({
      where: { id },
      include: productIncludes,
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async createProduct(input: CreateProductDto, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        const sku = normalizedSku(input.sku)
        await this.ensureCategories(tx, input.categoryIds)
        await this.ensureSkuUnique(tx, sku)
        const variants = input.variants ?? []
        const seenSkus = new Set([sku])
        const seenOptions = new Set<string>()
        for (const variant of variants) {
          const variantSku = normalizedSku(variant.sku)
          if (seenSkus.has(variantSku))
            throw new ConflictException('Duplicate SKU')
          seenSkus.add(variantSku)
          const key = optionKey(cleanOptions(variant.options))
          if (seenOptions.has(key))
            throw new ConflictException('Duplicate variant combination')
          seenOptions.add(key)
          await this.ensureSkuUnique(tx, variantSku)
        }
        if (variants.length && (input.stockOnHand ?? 0) !== 0) {
          throw new BadRequestException(
            'Use variant stock when a product has variants',
          )
        }
        this.checkCompareAt(input.priceMinor, input.compareAtMinor)
        const product = await tx.product.create({
          data: {
            title: requireText(input.title, 'Product title'),
            slug: input.slug,
            sku,
            description: clean(input.description ?? ''),
            status: input.status ?? 'DRAFT',
            currency: input.currency ?? 'USD',
            priceMinor: input.priceMinor,
            compareAtMinor: input.compareAtMinor ?? null,
            hasVariants: variants.length > 0,
            stockOnHand: variants.length ? 0 : (input.stockOnHand ?? 0),
            categories: {
              create: input.categoryIds.map((categoryId) => ({ categoryId })),
            },
            ...(variants.length
              ? {
                  variants: {
                    create: variants.map((variant) => ({
                      sku: normalizedSku(variant.sku),
                      options: cleanOptions(variant.options),
                      priceMinor: variant.priceMinor ?? null,
                      stockOnHand: variant.stockOnHand ?? 0,
                    })),
                  },
                }
              : {}),
          },
          include: productIncludes,
        })
        await this.audit(tx, actorId, 'product.created', 'product', product.id)
        return product
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async updateProduct(id: string, input: UpdateProductDto, actorId: string) {
    if (input.variants !== undefined) {
      throw new BadRequestException(
        'Modify variants through dedicated variant endpoints',
      )
    }
    try {
      return await this.database.client.$transaction(async (tx) => {
        const previous = await tx.product.findUnique({ where: { id } })
        if (!previous) throw new NotFoundException('Product not found')
        if (input.categoryIds)
          await this.ensureCategories(tx, input.categoryIds)
        if (input.sku !== undefined)
          await this.ensureSkuUnique(tx, normalizedSku(input.sku), id)
        if (input.stockOnHand !== undefined && previous.hasVariants) {
          throw new BadRequestException(
            'Use variant stock endpoint; product has variants',
          )
        }
        this.checkCompareAt(
          input.priceMinor ?? previous.priceMinor,
          input.compareAtMinor === undefined
            ? previous.compareAtMinor
            : input.compareAtMinor,
        )
        if (input.categoryIds) {
          await tx.productCategory.deleteMany({ where: { productId: id } })
          await tx.productCategory.createMany({
            data: input.categoryIds.map((categoryId) => ({
              productId: id,
              categoryId,
            })),
          })
        }
        const product = await tx.product.update({
          where: { id },
          data: {
            ...(input.title !== undefined
              ? { title: requireText(input.title, 'Product title') }
              : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.sku !== undefined
              ? { sku: normalizedSku(input.sku) }
              : {}),
            ...(input.description !== undefined
              ? { description: clean(input.description) }
              : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.currency !== undefined
              ? { currency: input.currency }
              : {}),
            ...(input.priceMinor !== undefined
              ? { priceMinor: input.priceMinor }
              : {}),
            ...(input.compareAtMinor !== undefined
              ? { compareAtMinor: input.compareAtMinor }
              : {}),
            ...(input.stockOnHand !== undefined
              ? { stockOnHand: input.stockOnHand }
              : {}),
          },
          include: productIncludes,
        })
        await this.audit(tx, actorId, 'product.updated', 'product', id)
        return product
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  /** Archive is non-destructive; preserve product/variant IDs for future orders. */
  async archiveProduct(id: string, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        const product = await tx.product.update({
          where: { id },
          data: { status: 'ARCHIVED' },
          include: productIncludes,
        })
        await this.audit(tx, actorId, 'product.archived', 'product', id)
        return product
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async addVariant(
    productId: string,
    input: CreateVariantDto,
    actorId: string,
  ) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        const product = await this.requireProduct(tx, productId)
        if (product.stockOnHand !== 0) {
          throw new ConflictException(
            'Move simple-product stock before creating variants',
          )
        }
        const sku = normalizedSku(input.sku)
        const options = cleanOptions(input.options)
        await this.ensureSkuUnique(tx, sku)
        await this.ensureOptionsUnique(tx, productId, options)
        const variant = await tx.productVariant.create({
          data: {
            productId,
            sku,
            options,
            priceMinor: input.priceMinor ?? null,
            stockOnHand: input.stockOnHand ?? 0,
          },
        })
        await tx.product.update({
          where: { id: productId },
          data: { hasVariants: true, stockOnHand: 0 },
        })
        await this.audit(tx, actorId, 'variant.created', 'variant', variant.id)
        return variant
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: UpdateVariantDto,
    actorId: string,
  ) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        const previous = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
        })
        if (!previous) throw new NotFoundException('Variant not found')
        if (input.sku !== undefined)
          await this.ensureSkuUnique(
            tx,
            normalizedSku(input.sku),
            undefined,
            variantId,
          )
        const oldOptions = previous.options as { size?: string; color?: string }
        const options =
          input.options !== undefined ? cleanOptions(input.options) : oldOptions
        if (input.options !== undefined)
          await this.ensureOptionsUnique(tx, productId, options, variantId)
        const variant = await tx.productVariant.update({
          where: { id: variantId },
          data: {
            ...(input.sku !== undefined
              ? { sku: normalizedSku(input.sku) }
              : {}),
            ...(input.options !== undefined ? { options } : {}),
            ...(input.priceMinor !== undefined
              ? { priceMinor: input.priceMinor }
              : {}),
            ...(input.stockOnHand !== undefined
              ? { stockOnHand: input.stockOnHand }
              : {}),
          },
        })
        await this.audit(tx, actorId, 'variant.updated', 'variant', variantId)
        return variant
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  async deleteVariant(productId: string, variantId: string, actorId: string) {
    try {
      return await this.database.client.$transaction(async (tx) => {
        const variant = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
        })
        if (!variant) throw new NotFoundException('Variant not found')
        const product = await this.requireProduct(tx, productId)
        if (product.status !== 'DRAFT' || variant.stockOnHand !== 0) {
          throw new ConflictException(
            'Only a zero-stock variant on a DRAFT product may be deleted',
          )
        }
        // Phase 04 will require archive/retention once orders can reference variants.
        await tx.productVariant.delete({ where: { id: variantId } })
        const remaining = await tx.productVariant.count({
          where: { productId },
        })
        if (!remaining)
          await tx.product.update({
            where: { id: productId },
            data: { hasVariants: false, stockOnHand: 0 },
          })
        await this.audit(tx, actorId, 'variant.deleted', 'variant', variantId)
        return { deleted: true, id: variantId }
      })
    } catch (err) {
      return translateDbError(err)
    }
  }

  private async requireCategory(tx: Prisma.TransactionClient, id: string) {
    const category = await tx.category.findUnique({ where: { id } })
    if (!category) throw new NotFoundException('Category not found')
    return category
  }
  private async requireProduct(tx: Prisma.TransactionClient, id: string) {
    const product = await tx.product.findUnique({ where: { id } })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }
  private async ensureCategories(tx: Prisma.TransactionClient, ids: string[]) {
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate category ID')
    const count = await tx.category.count({ where: { id: { in: ids } } })
    if (count !== ids.length)
      throw new BadRequestException('One or more categories do not exist')
  }
  private async ensureSkuUnique(
    tx: Prisma.TransactionClient,
    sku: string,
    exceptProduct?: string,
    exceptVariant?: string,
  ) {
    const [product, variant] = await Promise.all([
      tx.product.findFirst({
        where: {
          sku,
          ...(exceptProduct ? { id: { not: exceptProduct } } : {}),
        },
        select: { id: true },
      }),
      tx.productVariant.findFirst({
        where: {
          sku,
          ...(exceptVariant ? { id: { not: exceptVariant } } : {}),
        },
        select: { id: true },
      }),
    ])
    if (product || variant) throw new ConflictException('SKU already exists')
  }
  private async ensureOptionsUnique(
    tx: Prisma.TransactionClient,
    productId: string,
    options: { size?: string; color?: string },
    exceptVariant?: string,
  ) {
    const others = await tx.productVariant.findMany({
      where: {
        productId,
        ...(exceptVariant ? { id: { not: exceptVariant } } : {}),
      },
      select: { options: true },
    })
    if (
      others.some(
        (item) =>
          optionKey(item.options as { size?: string; color?: string }) ===
          optionKey(options),
      )
    ) {
      throw new ConflictException('Variant option combination already exists')
    }
  }
  private checkCompareAt(price: number, compare: number | null | undefined) {
    if (compare != null && compare <= price) {
      throw new BadRequestException(
        'Compare-at price must exceed selling price',
      )
    }
  }
  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    type: string,
    id: string,
  ) {
    return tx.auditEvent.create({
      data: { actorId, action, targetType: type, targetId: id },
    })
  }
}
