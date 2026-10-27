import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { SetCartItemDto } from './cart.dto'
import { validateCartSelection } from './cart.selection'
import { calculateCartQuote } from './cart.quote'

export const quoteIncludes = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      product: {
        select: {
          id: true,
          title: true,
          sku: true,
          status: true,
          currency: true,
          priceMinor: true,
          hasVariants: true,
          inventoryBalance: { select: { onHand: true } },
        },
      },
      variant: {
        select: {
          id: true,
          productId: true,
          sku: true,
          priceMinor: true,
          inventoryBalance: { select: { onHand: true } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude

@Injectable()
export class CartService {
  constructor(private readonly database: DatabaseService) {}

  async getQuote(customerId: string) {
    // Repeatable read gives a consistent live price/stock view for this quote.
    // It is NOT a stock hold; final checkout must revalidate in a transaction.
    return this.database.client.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId: customerId },
          include: quoteIncludes,
        })
        return calculateCartQuote(cart?.id ?? null, cart?.items ?? [])
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  async setItem(customerId: string, input: SetCartItemDto) {
    await this.database.client.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { userId: customerId },
        create: { userId: customerId },
        update: { updatedAt: new Date() },
      })
      // Serialize all concurrent cart writes per owner, including the 50-line cap.
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`
      const { product, variantId } = await validateCartSelection(tx, input)
      const otherCurrency = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          product: { currency: { not: product.currency } },
        },
        select: { id: true },
      })
      if (otherCurrency)
        throw new ConflictException('Cart cannot combine different currencies')
      const existing = await tx.cartItem.findFirst({
        where: { cartId: cart.id, productId: product.id, variantId },
        select: { id: true },
      })
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: input.quantity },
        })
      } else {
        const count = await tx.cartItem.count({ where: { cartId: cart.id } })
        if (count >= 50)
          throw new ConflictException('Cart cannot exceed 50 distinct lines')
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            variantId,
            quantity: input.quantity,
          },
        })
      }
    })
    return this.getQuote(customerId)
  }

  async removeItem(customerId: string, id: string) {
    await this.database.client.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: customerId },
        select: { id: true },
      })
      if (!cart) throw new NotFoundException('Cart item not found')
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`
      const result = await tx.cartItem.deleteMany({
        where: { id, cartId: cart.id },
      })
      if (!result.count) throw new NotFoundException('Cart item not found')
    })
    return this.getQuote(customerId)
  }

  async clear(customerId: string) {
    await this.database.client.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: customerId },
        select: { id: true },
      })
      if (!cart) return
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })
    })
    return this.getQuote(customerId)
  }
}
