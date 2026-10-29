import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'

export const WISHLIST_MAX_ITEMS = 100

@Injectable()
export class WishlistService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string) {
    // Hide unpublished products from the public/customer projection; keep the
    // bookmark so it reappears if legitimately republished.
    const rows = await this.database.client.wishlistItem.findMany({
      where: { userId, product: { status: 'ACTIVE' } },
      orderBy: [{ createdAt: 'desc' }, { productId: 'asc' }],
      take: WISHLIST_MAX_ITEMS,
      select: {
        productId: true,
        createdAt: true,
        product: {
          select: { slug: true, title: true, currency: true, priceMinor: true },
        },
      },
    })
    return {
      items: rows.map((r) => ({
        productId: r.productId,
        slug: r.product.slug,
        title: r.product.title,
        currency: r.product.currency,
        priceMinor: r.product.priceMinor,
        addedAt: r.createdAt.toISOString(),
      })),
      count: rows.length,
    }
  }

  private async addMany(userId: string, requestedIds: string[]) {
    if (!requestedIds.length) return this.list(userId)
    await this.database.client.$transaction(
      async (tx) => {
        // Serialize all wishlist additions/merges for the same customer. Unique
        // composite key also prevents duplicates under retries.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`
        const products = await tx.product.findMany({
          where: { id: { in: requestedIds }, status: 'ACTIVE' },
          select: { id: true },
        })
        if (products.length !== requestedIds.length)
          throw new NotFoundException('An active product was not found')
        const existing = await tx.wishlistItem.findMany({
          where: { userId },
          select: { productId: true },
        })
        const known = new Set(existing.map((r) => r.productId))
        const additions = requestedIds.filter((id) => !known.has(id))
        if (known.size + additions.length > WISHLIST_MAX_ITEMS)
          throw new ConflictException('Wishlist cannot exceed 100 products')
        if (additions.length) {
          await tx.wishlistItem.createMany({
            data: additions.map((productId) => ({ userId, productId })),
            skipDuplicates: true,
          })
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
    return this.list(userId)
  }

  add(userId: string, productId: string) {
    return this.addMany(userId, [productId])
  }

  merge(userId: string, productIds: string[]) {
    // Empty payload is a valid no-op; do not use a guest token or change cart.
    return this.addMany(userId, productIds)
  }

  async remove(userId: string, productId: string) {
    const result = await this.database.client.wishlistItem.deleteMany({
      where: { userId, productId },
    })
    return { removed: result.count > 0 }
  }
}
