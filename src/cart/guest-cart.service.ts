import { createHash, randomBytes } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { SetCartItemDto } from './cart.dto'
import { ensureCartEditable, quoteIncludes } from './cart.service'
import { calculateCartQuote } from './cart.quote'
import { validateCartSelection } from './cart.selection'

const MAX_LINES = 50
const GUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000
const guestQuoteIncludes = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: quoteIncludes.items.include,
  },
} satisfies Prisma.GuestCartInclude

function digest(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new UnauthorizedException('Valid guest cart capability required')
  return createHash('sha256').update(token).digest('hex')
}

@Injectable()
export class GuestCartService {
  constructor(private readonly database: DatabaseService) {}

  /** 256 bits of entropy; the bearer capability is never persisted in plaintext. */
  async create() {
    const guestToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + GUEST_TTL_MS)
    const guest = await this.database.client.guestCart.create({
      data: { tokenHash: digest(guestToken), expiresAt },
      select: { id: true },
    })
    return {
      guestToken,
      guestCartId: guest.id,
      expiresAt: expiresAt.toISOString(),
    }
  }

  private async lockActive(tx: Prisma.TransactionClient, token: string) {
    const hash = digest(token)
    const found = await tx.guestCart.findUnique({
      where: { tokenHash: hash },
      select: { id: true },
    })
    if (!found) throw new UnauthorizedException('Guest cart unavailable')
    // Serialize operations sharing the capability, including merge/revoke.
    await tx.$queryRaw`SELECT id FROM guest_carts WHERE id = ${found.id}::uuid FOR UPDATE`
    const guest = await tx.guestCart.findUnique({
      where: { id: found.id },
      include: guestQuoteIncludes,
    })
    if (!guest || guest.expiresAt <= new Date())
      throw new UnauthorizedException('Guest cart expired or unavailable')
    return guest
  }

  async getQuote(token: string) {
    // No stock hold: current product/variant price, currency and SKU inventory.
    return this.database.client.$transaction(
      async (tx) => {
        const guest = await tx.guestCart.findUnique({
          where: { tokenHash: digest(token) },
          include: guestQuoteIncludes,
        })
        if (!guest || guest.expiresAt <= new Date() || guest.mergedAt)
          throw new UnauthorizedException('Guest cart expired or consumed')
        return calculateCartQuote(guest.id, guest.items)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }

  async setItem(token: string, input: SetCartItemDto) {
    await this.database.client.$transaction(async (tx) => {
      const guest = await this.lockActive(tx, token)
      if (guest.mergedAt)
        throw new ConflictException('Guest cart already merged')
      const { product, variantId } = await validateCartSelection(tx, input)
      const otherCurrency = await tx.guestCartItem.findFirst({
        where: {
          guestCartId: guest.id,
          product: { currency: { not: product.currency } },
        },
        select: { id: true },
      })
      if (otherCurrency)
        throw new ConflictException('Cart cannot combine different currencies')
      const existing = await tx.guestCartItem.findFirst({
        where: { guestCartId: guest.id, productId: product.id, variantId },
        select: { id: true },
      })
      if (existing) {
        await tx.guestCartItem.update({
          where: { id: existing.id },
          data: { quantity: input.quantity },
        })
      } else {
        if (
          (await tx.guestCartItem.count({
            where: { guestCartId: guest.id },
          })) >= MAX_LINES
        )
          throw new ConflictException('Cart cannot exceed 50 distinct lines')
        await tx.guestCartItem.create({
          data: {
            guestCartId: guest.id,
            productId: product.id,
            variantId,
            quantity: input.quantity,
          },
        })
      }
    })
    return this.getQuote(token)
  }

  async removeItem(token: string, id: string) {
    await this.database.client.$transaction(async (tx) => {
      const guest = await this.lockActive(tx, token)
      if (guest.mergedAt)
        throw new ConflictException('Guest cart already merged')
      const result = await tx.guestCartItem.deleteMany({
        where: { id, guestCartId: guest.id },
      })
      if (!result.count)
        throw new NotFoundException('Guest cart item not found')
    })
    return this.getQuote(token)
  }

  async clear(token: string) {
    await this.database.client.$transaction(async (tx) => {
      const guest = await this.lockActive(tx, token)
      if (guest.mergedAt)
        throw new ConflictException('Guest cart already merged')
      await tx.guestCartItem.deleteMany({ where: { guestCartId: guest.id } })
    })
    return this.getQuote(token)
  }

  /** Revoking a capability makes it immediately unusable. */
  async revoke(token: string) {
    await this.database.client.$transaction(async (tx) => {
      const guest = await this.lockActive(tx, token)
      if (guest.mergedAt)
        throw new ConflictException('Guest cart already merged')
      await tx.guestCart.delete({ where: { id: guest.id } })
    })
    return { revoked: true }
  }

  /** Entire transfer is atomic; the row lock makes retries exactly-once. */
  async merge(customerId: string, token: string) {
    await this.database.client.$transaction(async (tx) => {
      const guest = await this.lockActive(tx, token)
      if (guest.mergedAt) {
        if (guest.mergedUserId !== customerId)
          throw new ConflictException('Guest cart already claimed')
        return // Same account + same token: idempotent no-op.
      }
      const cart = await tx.cart.upsert({
        where: { userId: customerId },
        create: { userId: customerId },
        update: { updatedAt: new Date() },
      })
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`
      await ensureCartEditable(tx, cart.id)
      const current = await tx.cartItem.findMany({
        where: { cartId: cart.id },
        select: {
          id: true,
          productId: true,
          variantId: true,
          quantity: true,
          product: { select: { currency: true } },
        },
      })
      const lines = guest.items
      const combined = new Map(
        current.map((line) => [
          `${line.productId}:${line.variantId ?? ''}`,
          line,
        ]),
      )
      if (lines.length && current.length) {
        const baseline = current[0]!.product.currency
        if (current.some((line) => line.product.currency !== baseline))
          throw new ConflictException(
            'Existing cart has inconsistent currencies',
          )
      }
      const currencies = new Set(current.map((line) => line.product.currency))
      const actions: Array<{
        itemId: string | null
        productId: string
        variantId: string | null
        quantity: number
      }> = []
      for (const line of lines) {
        const id = `${line.productId}:${line.variantId ?? ''}`
        const matched = combined.get(id)
        const quantity = line.quantity + (matched?.quantity ?? 0)
        if (quantity > 99)
          throw new ConflictException('Merged quantity exceeds 99')
        const { product } = await validateCartSelection(tx, {
          productId: line.productId,
          variantId: line.variantId,
          quantity,
        })
        currencies.add(product.currency)
        if (currencies.size > 1)
          throw new ConflictException(
            'Cart cannot combine different currencies',
          )
        if (!matched && combined.size + 1 > MAX_LINES)
          throw new ConflictException('Cart cannot exceed 50 distinct lines')
        actions.push({
          itemId: matched?.id ?? null,
          productId: line.productId,
          variantId: line.variantId,
          quantity,
        })
        // Distinct guest lines never repeat; reserve this key for the 50-line cap.
        if (!matched)
          combined.set(id, {
            id: '',
            productId: line.productId,
            variantId: line.variantId,
            quantity,
            product: { currency: product.currency },
          })
      }
      // Apply only after every line has passed current stock and currency checks.
      for (const action of actions) {
        if (action.itemId) {
          await tx.cartItem.update({
            where: { id: action.itemId },
            data: { quantity: action.quantity },
          })
        } else {
          await tx.cartItem.create({
            data: {
              cartId: cart.id,
              productId: action.productId,
              variantId: action.variantId,
              quantity: action.quantity,
            },
          })
        }
      }
      await tx.guestCart.update({
        where: { id: guest.id },
        data: { mergedUserId: customerId, mergedAt: new Date() },
      })
    })
    // The guest token cannot read this account's cart: JWT is required here.
    const cart = await this.database.client.cart.findUnique({
      where: { userId: customerId },
      include: quoteIncludes,
    })
    return calculateCartQuote(cart?.id ?? null, cart?.items ?? [])
  }
}
