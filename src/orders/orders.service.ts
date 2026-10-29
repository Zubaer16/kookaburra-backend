import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { presentShipment } from './fulfillment.service'
import {
  CreateOrderDto,
  OrderQueryDto,
  OrderShippingAddressDto,
} from './orders.dto'

export const ORDER_PAYMENT_WINDOW_MS = 20 * 60 * 1000
const includeOrder = {
  lines: { orderBy: { id: 'asc' as const } },
  shipment: true,
} satisfies Prisma.OrderInclude

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof includeOrder }>

function normalizeAddress(input: OrderShippingAddressDto) {
  const normalize = (value: string | undefined) => value?.trim() || null
  return {
    recipientName: input.recipientName.trim(),
    phone: input.phone.trim(),
    addressLine1: input.addressLine1.trim(),
    addressLine2: normalize(input.addressLine2),
    city: input.city.trim(),
    region: normalize(input.region),
    postalCode: normalize(input.postalCode),
    countryCode: input.countryCode,
  }
}

export function orderRequestFingerprint(input: CreateOrderDto) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        reservationId: input.reservationId,
        shippingAddress: normalizeAddress(input.shippingAddress),
      }),
    )
    .digest('hex')
}

function present(order: OrderRecord) {
  return {
    id: order.id,
    reservationId: order.reservationId,
    requestId: order.requestId,
    status: order.status,
    countryCode: order.countryCode,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    shippingMinor: order.shippingMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    shippingAddress: order.shippingAddress,
    paymentDeadlineAt: order.paymentDeadlineAt,
    paidAt: order.paidAt,
    fulfillment: presentShipment(order.shipment),
    createdAt: order.createdAt,
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      variantId: line.variantId,
      title: line.titleSnapshot,
      sku: line.skuSnapshot,
      optionsSnapshotJson: line.optionsSnapshotJson,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
    })),
    payable: false as const,
  }
}

@Injectable()
export class OrdersService {
  constructor(private readonly database: DatabaseService) {}

  private async requireOwn(
    tx: Prisma.TransactionClient,
    customerId: string,
    id: string,
  ) {
    const exists = await tx.order.findFirst({
      where: { id, customerId },
      select: { id: true },
    })
    if (!exists) throw new NotFoundException('Order not found')
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`
    return tx.order.findUniqueOrThrow({ where: { id }, include: includeOrder })
  }

  private matching(
    existing: OrderRecord,
    input: CreateOrderDto,
    requestHash: string,
  ) {
    if (
      existing.requestHash !== requestHash ||
      existing.reservationId !== input.reservationId
    )
      throw new ConflictException(
        'Order request UUID reused with different details',
      )
    return present(existing)
  }

  /** No external gateway call. Transfers reservation ownership to an unpaid order.
   * reserved_quantity remains allocated; on_hand and physical mirrors DO NOT change.
   */
  async create(customerId: string, input: CreateOrderDto) {
    const address = normalizeAddress(input.shippingAddress)
    if (!address.recipientName || !address.addressLine1 || !address.city)
      throw new BadRequestException('Delivery address cannot be blank')
    const hash = orderRequestFingerprint(input)
    const uniqueKey = {
      customerId_requestId: { customerId, requestId: input.requestId },
    }
    const replay = await this.database.client.order.findUnique({
      where: uniqueKey,
      include: includeOrder,
    })
    if (replay) return this.matching(replay, input, hash)
    try {
      return await this.database.client.$transaction(
        async (tx) => {
          // Verify the reservation belongs to this customer before cart state, so
          // a non-existent reservation returns 404 regardless of whether the
          // customer has configured a cart yet. Lock order stays cart -> reservation.
          const reservationOwner = await tx.checkoutReservation.findFirst({
            where: { id: input.reservationId, customerId },
            select: { id: true, cartId: true },
          })
          if (!reservationOwner)
            throw new NotFoundException('Reservation not found')
          // Lock order creation against cart edits and fresh reservation creation.
          const cart = await tx.cart.findUnique({
            where: { userId: customerId },
            select: { id: true },
          })
          if (!cart) throw new ConflictException('Cart is not checkout-ready')
          if (cart.id !== reservationOwner.cartId)
            throw new NotFoundException('Reservation not found')
          await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`
          const racedReplay = await tx.order.findUnique({
            where: uniqueKey,
            include: includeOrder,
          })
          if (racedReplay) return this.matching(racedReplay, input, hash)
          // Same reservation row-lock order as release and expiry worker.
          await tx.$queryRaw`SELECT id FROM checkout_reservations WHERE id = ${input.reservationId}::uuid FOR UPDATE`
          const reservation = await tx.checkoutReservation.findUniqueOrThrow({
            where: { id: input.reservationId },
            include: { lines: true },
          })
          const preExisting = await tx.order.findUnique({
            where: { reservationId: reservation.id },
            include: includeOrder,
          })
          if (preExisting) {
            if (preExisting.requestId === input.requestId)
              return this.matching(preExisting, input, hash)
            throw new ConflictException(
              'Reservation has already been consumed by an order',
            )
          }
          // The database clock governs expiry so delayed jobs cannot extend a hold.
          const unexpired = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM checkout_reservations
          WHERE id = ${reservation.id}::uuid AND status = 'ACTIVE'
            AND expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        `
          if (!unexpired.length)
            throw new ConflictException(
              'Reservation is expired or no longer active',
            )
          if (reservation.countryCode !== address.countryCode)
            throw new ConflictException(
              'Delivery country must match reserved checkout country',
            )
          if (!reservation.lines.length)
            throw new ConflictException('Reservation has no line items')
          if (
            reservation.subtotalMinor +
              reservation.shippingMinor +
              reservation.taxMinor !==
            reservation.estimatedTotalMinor
          )
            throw new ConflictException(
              'Reservation total integrity check failed',
            )
          // Prevent silently converting stale/modified cart contents into an order.
          const cartLines = await tx.cartItem.findMany({
            where: { cartId: cart.id },
          })
          if (
            cartLines.length !== reservation.lines.length ||
            reservation.lines.some(
              (line) =>
                !cartLines.some(
                  (item) =>
                    item.productId === line.productId &&
                    item.variantId === line.variantId &&
                    item.quantity === line.quantity,
                ),
            )
          )
            throw new ConflictException(
              'Cart no longer matches its reservation',
            )
          const productIds = [
            ...new Set(reservation.lines.map((line) => line.productId)),
          ]
          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              title: true,
              sku: true,
              status: true,
              currency: true,
            },
          })
          const variantIds = reservation.lines
            .map((line) => line.variantId)
            .filter((id): id is string => id !== null)
          const variants = await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, productId: true, sku: true, options: true },
          })
          const snapshotLines = reservation.lines.map((line) => {
            const product = products.find(
              (entry) => entry.id === line.productId,
            )
            const variant = line.variantId
              ? variants.find((entry) => entry.id === line.variantId)
              : null
            if (
              !product ||
              product.status !== 'ACTIVE' ||
              product.currency !== reservation.currency ||
              (line.variantId && (!variant || variant.productId !== product.id))
            )
              throw new ConflictException(
                'Reserved product or variant is no longer available',
              )
            const lineTotalMinor = line.unitPriceMinor * line.quantity
            if (
              !Number.isSafeInteger(lineTotalMinor) ||
              lineTotalMinor > 2147483647
            )
              throw new ConflictException('Order line money overflow')
            return {
              productId: line.productId,
              variantId: line.variantId,
              titleSnapshot: product.title,
              skuSnapshot: variant?.sku ?? product.sku,
              optionsSnapshotJson: JSON.stringify(variant?.options ?? {}),
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              lineTotalMinor,
            }
          })
          if (
            snapshotLines.reduce(
              (sum, line) => sum + line.lineTotalMinor,
              0,
            ) !== reservation.subtotalMinor
          )
            throw new ConflictException(
              'Reservation price snapshot inconsistent with subtotal',
            )
          const order = await tx.order.create({
            data: {
              customerId,
              cartId: cart.id,
              reservationId: reservation.id,
              requestId: input.requestId,
              requestHash: hash,
              countryCode: reservation.countryCode,
              currency: reservation.currency,
              subtotalMinor: reservation.subtotalMinor,
              shippingMinor: reservation.shippingMinor,
              taxMinor: reservation.taxMinor,
              totalMinor: reservation.estimatedTotalMinor,
              shippingAddress: address,
              paymentDeadlineAt: new Date(Date.now() + ORDER_PAYMENT_WINDOW_MS),
              lines: { create: snapshotLines },
              statusEvents: {
                create: { status: 'PENDING_PAYMENT', reason: 'ORDER_CREATED' },
              },
            },
            include: includeOrder,
          })
          await tx.checkoutReservation.update({
            where: { id: reservation.id },
            data: { status: 'CONSUMED' },
          })
          await tx.outboxEvent.create({
            data: {
              eventType: 'order.created',
              payload: {
                orderId: order.id,
                customerId,
                status: 'PENDING_PAYMENT',
              },
            },
          })
          return present(order)
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.database.client.order.findUnique({
          where: uniqueKey,
          include: includeOrder,
        })
        if (winner) return this.matching(winner, input, hash)
        const consumed = await this.database.client.order.findUnique({
          where: { reservationId: input.reservationId },
          select: { id: true },
        })
        if (consumed)
          throw new ConflictException(
            'Reservation has already been consumed by an order',
          )
      }
      throw error
    }
  }

  async get(customerId: string, id: string) {
    const order = await this.database.client.order.findFirst({
      where: { id, customerId },
      include: includeOrder,
    })
    if (!order) throw new NotFoundException('Order not found')
    return present(order)
  }

  async list(customerId: string, query: OrderQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const where = { customerId }
    const [orders, total] = await this.database.client.$transaction([
      this.database.client.order.findMany({
        where,
        include: includeOrder,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.client.order.count({ where }),
    ])
    return {
      items: orders.map(present),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }
  }

  /** Caller holds the order FOR UPDATE lock, shared with cancellation and expiry. */
  private async closePending(
    tx: Prisma.TransactionClient,
    order: OrderRecord,
    target: 'CANCELLED' | 'EXPIRED',
  ) {
    if (order.status !== 'PENDING_PAYMENT') return order
    // A signed success receipt awaiting provider verification fences allocation
    // release. Worker must reconcile first; do not free potentially paid stock.
    // Once TEST confirmation starts, provider-side capture can succeed even
    // without a webhook yet. Never release its stock before reconciliation.
    const inFlight = await tx.paymentAttempt.findFirst({
      where: {
        orderId: order.id,
        OR: [
          { status: { in: ['CONFIRMING', 'CAPTURING', 'AWAITING_WEBHOOK'] } },
          { status: 'REQUIRES_REVIEW', testCompletionAttempts: { gt: 0 } },
        ],
      },
      select: { id: true },
    })
    if (inFlight)
      throw new ConflictException(
        'TEST payment is in progress; reconcile before closing order',
      )
    const unresolvedSucceeded = await tx.paymentWebhookReceipt.findFirst({
      where: {
        eventType: 'payment_intent.succeeded',
        status: { in: ['RECEIVED', 'PROCESSING'] },
        providerIntentId: {
          in: (
            await tx.paymentAttempt.findMany({
              where: { orderId: order.id },
              select: { providerIntentId: true },
            })
          )
            .map((a) => a.providerIntentId)
            .filter((id): id is string => !!id),
        },
      },
      select: { id: true },
    })
    if (unresolvedSucceeded)
      throw new ConflictException(
        'Payment success is awaiting reconciliation; cannot release allocation',
      )
    const lines = await tx.checkoutReservationLine.findMany({
      where: { reservationId: order.reservationId },
      orderBy: [{ balanceId: 'asc' }],
    })
    if (!lines.length)
      throw new ConflictException('Order allocation has no reservation lines')
    for (const line of lines) {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE inventory_balances SET reserved_quantity = reserved_quantity - ${line.quantity},
          updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE id = ${line.balanceId}::uuid AND reserved_quantity >= ${line.quantity}
        RETURNING id
      `
      if (updated.length !== 1)
        throw new ConflictException('Order allocation integrity check failed')
    }
    const changed = await tx.order.update({
      where: { id: order.id },
      data: {
        status: target,
        closedAt: new Date(),
        statusEvents: {
          create: {
            status: target,
            reason:
              target === 'EXPIRED'
                ? 'PAYMENT_WINDOW_ELAPSED'
                : 'CUSTOMER_CANCELLED',
          },
        },
      },
      include: includeOrder,
    })
    await tx.outboxEvent.create({
      data: {
        eventType: target === 'EXPIRED' ? 'order.expired' : 'order.cancelled',
        payload: {
          orderId: order.id,
          customerId: order.customerId,
          status: target,
        },
      },
    })
    return changed
  }

  async cancel(customerId: string, id: string) {
    return this.database.client.$transaction(
      async (tx) => {
        const order = await this.requireOwn(tx, customerId, id)
        if (order.status === 'PAID')
          throw new ConflictException(
            'Paid orders cannot be cancelled by unpaid-order cancellation',
          )
        const closed = await this.closePending(
          tx,
          order,
          order.paymentDeadlineAt <= new Date() ? 'EXPIRED' : 'CANCELLED',
        )
        return present(closed)
      },
      { timeout: 15000 },
    )
  }

  /** Idempotent, multi-worker-safe expiry. Select/lock order before inventory rows. */
  async expireBatch(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ConflictException('Invalid order expiry batch size')
    return this.database.client.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT o.id FROM orders o WHERE o.status = 'PENDING_PAYMENT'
          AND o.payment_deadline_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          AND NOT EXISTS (
            SELECT 1 FROM payment_attempts pa2 WHERE pa2.order_id = o.id
              AND (pa2.status IN ('CONFIRMING', 'CAPTURING', 'AWAITING_WEBHOOK')
                OR (pa2.status = 'REQUIRES_REVIEW' AND pa2.test_completion_attempts > 0))
          )
          AND NOT EXISTS (
            SELECT 1 FROM payment_attempts pa
              JOIN payment_webhook_receipts r ON r.provider_intent_id = pa.provider_intent_id
            WHERE pa.order_id = o.id AND r.event_type = 'payment_intent.succeeded'
              AND r.status IN ('RECEIVED', 'PROCESSING')
          )
        ORDER BY o.payment_deadline_at, o.id
        LIMIT ${limit} FOR UPDATE SKIP LOCKED
      `
        for (const row of rows) {
          const locked = await tx.order.findUniqueOrThrow({
            where: { id: row.id },
            include: includeOrder,
          })
          await this.closePending(tx, locked, 'EXPIRED')
        }
        return { expired: rows.length }
      },
      { timeout: 30000 },
    )
  }
}
