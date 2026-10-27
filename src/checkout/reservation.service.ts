import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { quoteIncludes } from '../cart/cart.service'
import { calculateCartQuote } from '../cart/cart.quote'
import { estimateConfiguredCharges } from './checkout.pricing'
import { CreateReservationDto } from './reservation.dto'

// A bounded hold; a scheduled checkout:expire run is required in deployment.
export const RESERVATION_TTL_MS = 10 * 60 * 1000
const includeLines = {
  lines: { orderBy: { balanceId: 'asc' as const } },
} satisfies Prisma.CheckoutReservationInclude

type Hold = Prisma.CheckoutReservationGetPayload<{
  include: typeof includeLines
}>

function present(hold: Hold) {
  return {
    id: hold.id,
    cartId: hold.cartId,
    requestId: hold.requestId,
    status: hold.status,
    countryCode: hold.countryCode,
    currency: hold.currency,
    subtotalMinor: hold.subtotalMinor,
    shippingMinor: hold.shippingMinor,
    taxMinor: hold.taxMinor,
    estimatedTotalMinor: hold.estimatedTotalMinor,
    expiresAt: hold.expiresAt,
    items: hold.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
    })),
    payable: false as const,
  }
}

@Injectable()
export class ReservationService {
  constructor(private readonly database: DatabaseService) {}

  /** Must run within one DB transaction. Locks reservation row before balances. */
  private async transition(
    tx: Prisma.TransactionClient,
    id: string,
    action: 'RELEASED' | 'EXPIRED',
  ) {
    await tx.$queryRaw`SELECT id FROM checkout_reservations WHERE id = ${id}::uuid FOR UPDATE`
    const record = await tx.checkoutReservation.findUnique({
      where: { id },
      include: includeLines,
    })
    if (!record) throw new NotFoundException('Checkout reservation not found')
    if (record.status !== 'ACTIVE') return record
    for (const line of [...record.lines].sort((a, b) =>
      a.balanceId.localeCompare(b.balanceId),
    )) {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE inventory_balances
        SET reserved_quantity = reserved_quantity - ${line.quantity}, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE id = ${line.balanceId}::uuid AND reserved_quantity >= ${line.quantity}
        RETURNING id
      `
      if (updated.length !== 1)
        throw new ConflictException(
          'Reservation balance integrity check failed',
        )
    }
    return tx.checkoutReservation.update({
      where: { id },
      data: { status: action, releasedAt: new Date() },
      include: includeLines,
    })
  }

  async reserve(customerId: string, input: CreateReservationDto) {
    const key = {
      customerId_requestId: { customerId, requestId: input.requestId },
    }
    const seen = await this.database.client.checkoutReservation.findUnique({
      where: key,
      include: includeLines,
    })
    if (seen) {
      if (seen.countryCode !== input.countryCode)
        throw new ConflictException(
          'Request UUID reused with different country',
        )
      return this.get(customerId, seen.id)
    }
    try {
      return await this.database.client.$transaction(
        async (tx) => {
          const cartRef = await tx.cart.findUnique({
            where: { userId: customerId },
            select: { id: true },
          })
          if (!cartRef)
            throw new ConflictException('Cart is not checkout-ready')
          // Serialize cart edits, merge and requests for different idempotency keys.
          await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartRef.id}::uuid FOR UPDATE`
          const replay = await tx.checkoutReservation.findUnique({
            where: key,
            include: includeLines,
          })
          if (replay) {
            if (replay.countryCode !== input.countryCode)
              throw new ConflictException(
                'Request UUID reused with different country',
              )
            return present(
              replay.status === 'ACTIVE' && replay.expiresAt <= new Date()
                ? await this.transition(tx, replay.id, 'EXPIRED')
                : replay,
            )
          }
          const active = await tx.checkoutReservation.findFirst({
            where: { cartId: cartRef.id, status: 'ACTIVE' },
            select: { id: true, expiresAt: true },
          })
          if (active) {
            if (active.expiresAt > new Date())
              throw new ConflictException(
                'Release the existing active reservation before reserving again',
              )
            await this.transition(tx, active.id, 'EXPIRED')
          }
          const cart = await tx.cart.findUniqueOrThrow({
            where: { id: cartRef.id },
            include: quoteIncludes,
          })
          const quote = calculateCartQuote(cart.id, cart.items)
          if (!quote.checkoutReady || !quote.currency)
            throw new ConflictException({
              message: 'Cart is not checkout-ready',
              issues: quote.issues,
            })
          const rate = await tx.checkoutRate.findUnique({
            where: {
              countryCode_currency: {
                countryCode: input.countryCode,
                currency: quote.currency,
              },
            },
          })
          if (!rate?.enabled)
            throw new UnprocessableEntityException(
              'No enabled shipping/tax policy for this country/currency',
            )
          const charges = estimateConfiguredCharges(
            quote.subtotalMinor,
            rate.shippingMinor,
            rate.freeOverSubtotalMinor,
            rate.taxBps,
          )
          const lines = cart.items
            .map((line) => {
              const balanceId = line.product.hasVariants
                ? line.variant?.inventoryBalance?.id
                : line.product.inventoryBalance?.id
              if (!balanceId)
                throw new ConflictException('Inventory balance unavailable')
              const price = line.variant?.priceMinor ?? line.product.priceMinor
              return {
                balanceId,
                productId: line.productId,
                variantId: line.variantId,
                quantity: line.quantity,
                unitPriceMinor: price,
              }
            })
            .sort((a, b) => a.balanceId.localeCompare(b.balanceId))
          // Guarded atomic updates form a single transaction. No oversell or partial hold.
          for (const line of lines) {
            const changed = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE inventory_balances
            SET reserved_quantity = reserved_quantity + ${line.quantity}, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            WHERE id = ${line.balanceId}::uuid
              AND on_hand - reserved_quantity >= ${line.quantity}
            RETURNING id
          `
            if (changed.length !== 1)
              throw new ConflictException(
                'Insufficient available stock for reservation',
              )
          }
          const saved = await tx.checkoutReservation.create({
            data: {
              customerId,
              cartId: cartRef.id,
              requestId: input.requestId,
              countryCode: input.countryCode,
              currency: quote.currency,
              subtotalMinor: quote.subtotalMinor,
              shippingMinor: charges.shippingMinor,
              taxMinor: charges.taxMinor,
              estimatedTotalMinor: charges.estimatedTotalMinor,
              expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
              lines: { create: lines },
            },
            include: includeLines,
          })
          return present(saved)
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      )
    } catch (error) {
      // Concurrent identical UUID requests: the unique loser can return the winner.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner =
          await this.database.client.checkoutReservation.findUnique({
            where: key,
            include: includeLines,
          })
        if (winner && winner.countryCode === input.countryCode)
          return present(winner)
      }
      throw error
    }
  }

  async get(customerId: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      const found = await tx.checkoutReservation.findFirst({
        where: { id, customerId },
        select: { id: true },
      })
      if (!found) throw new NotFoundException('Checkout reservation not found')
      const locked = await tx.checkoutReservation.findUniqueOrThrow({
        where: { id },
        include: includeLines,
      })
      const result =
        locked.status === 'ACTIVE' && locked.expiresAt <= new Date()
          ? await this.transition(tx, id, 'EXPIRED')
          : locked
      return present(result)
    })
  }

  async release(customerId: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      const found = await tx.checkoutReservation.findFirst({
        where: { id, customerId },
        select: { id: true },
      })
      if (!found) throw new NotFoundException('Checkout reservation not found')
      const locked = await tx.checkoutReservation.findUniqueOrThrow({
        where: { id },
        include: includeLines,
      })
      const result =
        locked.status === 'ACTIVE'
          ? await this.transition(
              tx,
              id,
              locked.expiresAt <= new Date() ? 'EXPIRED' : 'RELEASED',
            )
          : locked
      return present(result)
    })
  }

  /** Safe for concurrent schedulers: SKIP LOCKED, idempotent release. */
  async expireBatch(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ConflictException('Invalid expiry batch size')
    return this.database.client.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM checkout_reservations
        WHERE status = 'ACTIVE' AND expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        ORDER BY expires_at ASC, id ASC
        LIMIT ${limit} FOR UPDATE SKIP LOCKED
      `
        for (const row of ids) await this.transition(tx, row.id, 'EXPIRED')
        return { expired: ids.length }
      },
      { timeout: 30000 },
    )
  }
}
