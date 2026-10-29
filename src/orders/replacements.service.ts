import { createHash } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { ReplacementActionDto, ShipReplacementDto } from './replacements.dto'
import {
  isInspectedReturn,
  replacementTransitionAllowed,
} from './replacements.policy'

const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 15000,
} as const

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function present(row: {
  id: string
  orderId: string
  returnId: string
  productId: string
  variantId: string | null
  skuSnapshot: string | null
  quantity: number
  status: string
  carrier: string | null
  trackingNumber: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    orderId: row.orderId,
    returnId: row.returnId,
    productId: row.productId,
    variantId: row.variantId,
    skuSnapshot: row.skuSnapshot,
    quantity: row.quantity,
    status: row.status,
    carrier: row.carrier,
    trackingNumber: row.trackingNumber,
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** G1 / 04D-2B-1. A replacement is a non-financial, separate fulfillment
 * document; never create a fake paid Order or re-settle a payment.
 * Lock order -> read return/replacement -> conditionally update inventory.
 */
@Injectable()
export class ReplacementsService {
  constructor(private readonly database: DatabaseService) {}

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `
    if (!rows.length) throw new NotFoundException('Order not found')
  }

  private async assertNoRefund(tx: Prisma.TransactionClient, orderId: string) {
    // Conservative v1 policy: even failed/review refunds require resolution before
    // authorizing a replacement. Never mix automatic recovery mechanisms.
    const refund = await tx.refundRequest.findFirst({
      where: { orderId },
      select: { id: true },
    })
    if (refund)
      throw new ConflictException(
        'Order has a refund record; manual financial review required',
      )
  }

  async authorize(
    orderId: string,
    returnId: string,
    actorId: string,
    input: ReplacementActionDto,
  ) {
    const requestHash = hash({ action: 'AUTHORIZE', returnId })
    return this.database.client.$transaction(async (tx) => {
      await this.lockOrder(tx, orderId)
      const previous = await tx.orderReplacement.findUnique({
        where: { orderId_requestId: { orderId, requestId: input.requestId } },
      })
      if (previous) {
        if (
          previous.requestHash !== requestHash ||
          previous.returnId !== returnId
        )
          throw new ConflictException(
            'Replacement UUID reused with different details',
          )
        return present(previous)
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { shipment: true, paymentTransaction: true },
      })
      if (
        order.status !== 'PAID' ||
        !order.paidAt ||
        !order.paymentTransaction ||
        order.shipment?.status !== 'DELIVERED'
      )
        throw new ConflictException(
          'Only verified paid and delivered orders permit replacement',
        )
      await this.assertNoRefund(tx, orderId)
      const ret = await tx.orderReturn.findFirst({
        where: { id: returnId, orderId },
        include: { orderLine: true },
      })
      if (!ret) throw new NotFoundException('Return not found')
      if (!isInspectedReturn(ret.status))
        throw new ConflictException(
          'Return must be physically inspected before replacement',
        )
      const already = await tx.orderReplacement.findUnique({
        where: { returnId },
        select: { id: true },
      })
      if (already)
        throw new ConflictException(
          'Return already has a replacement authorization',
        )
      // Same original SKU, no price difference and at most the inspected return quantity.
      const created = await tx.orderReplacement.create({
        data: {
          orderId,
          returnId,
          requestId: input.requestId,
          requestHash,
          productId: ret.orderLine.productId,
          variantId: ret.orderLine.variantId,
          skuSnapshot: ret.orderLine.skuSnapshot,
          quantity: ret.quantity,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'order.replacement.authorize',
          targetType: 'order_replacement',
          targetId: created.id,
        },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: 'order.replacement.authorized',
          payload: {
            orderId,
            customerId: order.customerId,
            returnId,
            replacementId: created.id,
            status: 'AUTHORIZED',
          },
        },
      })
      return present(created)
    }, options)
  }

  private async action(
    orderId: string,
    replacementId: string,
    actorId: string,
    input: ReplacementActionDto,
    action: 'SHIP' | 'DELIVER' | 'CANCEL',
    shipping?: ShipReplacementDto,
  ) {
    const carrier = shipping?.carrier.trim()
    const trackingNumber = shipping?.trackingNumber.trim()
    const requestHash = hash({
      action,
      carrier: carrier ?? null,
      trackingNumber: trackingNumber ?? null,
    })
    return this.database.client.$transaction(async (tx) => {
      await this.lockOrder(tx, orderId)
      const row = await tx.orderReplacement.findFirst({
        where: { id: replacementId, orderId },
      })
      if (!row) throw new NotFoundException('Replacement not found')
      const old = await tx.orderReplacementEvent.findUnique({
        where: {
          replacementId_requestId: {
            replacementId,
            requestId: input.requestId,
          },
        },
      })
      if (old) {
        if (old.requestHash !== requestHash || old.action !== action)
          throw new ConflictException(
            'Replacement action UUID reused with different details',
          )
        return present(row)
      }
      if (
        action === 'SHIP' &&
        !replacementTransitionAllowed(row.status, action)
      )
        throw new ConflictException(
          'Only authorized replacement can be shipped',
        )
      if (
        action === 'DELIVER' &&
        !replacementTransitionAllowed(row.status, action)
      )
        throw new ConflictException('Only shipped replacement can be delivered')
      if (
        action === 'CANCEL' &&
        !replacementTransitionAllowed(row.status, action)
      )
        throw new ConflictException(
          'Dispatched replacement cannot be cancelled or restocked automatically',
        )

      if (action === 'SHIP') {
        if (!carrier || !trackingNumber)
          throw new ConflictException('Carrier and tracking are required')
        await this.assertNoRefund(tx, orderId)
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            shipment: true,
            paymentTransaction: { select: { id: true } },
          },
        })
        if (
          order.status !== 'PAID' ||
          !order.paidAt ||
          !order.paymentTransaction ||
          order.shipment?.status !== 'DELIVERED'
        )
          throw new ConflictException(
            'Original order is no longer eligible for replacement',
          )
        const balance = await tx.inventoryBalance.findFirst({
          where: row.variantId
            ? { variantId: row.variantId }
            : { productId: row.productId },
          include: { product: true, variant: true },
        })
        if (
          !balance ||
          (row.variantId
            ? !balance.variant ||
              balance.variant.productId !== row.productId ||
              balance.variant.sku !== row.skuSnapshot ||
              balance.productId !== null ||
              (
                await tx.product.findUnique({
                  where: { id: row.productId },
                  select: { status: true },
                })
              )?.status !== 'ACTIVE'
            : !balance.product ||
              balance.product.hasVariants ||
              balance.product.status !== 'ACTIVE' ||
              balance.product.sku !== row.skuSnapshot)
        )
          throw new ConflictException(
            'Original SKU unavailable or changed; manual review required',
          )
        // Single guarded UPDATE prevents oversell even with late reservation cleanup.
        const changed = await tx.$queryRaw<Array<{ on_hand: number }>>`
          UPDATE inventory_balances
          SET on_hand = on_hand - ${row.quantity},
              updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          WHERE id = ${balance.id}::uuid
            AND on_hand >= ${row.quantity}
            AND on_hand - reserved_quantity >= ${row.quantity}
          RETURNING on_hand
        `
        if (!changed.length)
          throw new ConflictException(
            'Insufficient unreserved original SKU stock for replacement',
          )
        const after = changed[0]!.on_hand
        if (balance.variantId) {
          await tx.productVariant.update({
            where: { id: balance.variantId },
            data: { stockOnHand: after },
          })
        } else if (balance.productId) {
          await tx.product.update({
            where: { id: balance.productId },
            data: { stockOnHand: after },
          })
        }
        await tx.inventoryMovement.create({
          data: {
            balanceId: balance.id,
            requestId: row.id,
            reason: 'REPLACEMENT',
            delta: -row.quantity,
            before: after + row.quantity,
            after,
            actorId,
            note: `Replacement dispatch ${row.id}`,
          },
        })
      }
      const status =
        action === 'SHIP'
          ? 'SHIPPED'
          : action === 'DELIVER'
            ? 'DELIVERED'
            : 'CANCELLED'
      const now = new Date()
      const updated = await tx.orderReplacement.update({
        where: { id: replacementId },
        data:
          action === 'SHIP'
            ? { status, carrier, trackingNumber, shippedAt: now }
            : action === 'DELIVER'
              ? { status, deliveredAt: now }
              : { status },
      })
      await tx.orderReplacementEvent.create({
        data: {
          replacementId,
          requestId: input.requestId,
          requestHash,
          action,
          actorId,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: `order.replacement.${action.toLowerCase()}`,
          targetType: 'order_replacement',
          targetId: replacementId,
        },
      })
      const original = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { customerId: true },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: `order.replacement.${action.toLowerCase()}`,
          payload: {
            orderId,
            customerId: original.customerId,
            returnId: row.returnId,
            replacementId,
            status,
          },
        },
      })
      return present(updated)
    }, options)
  }

  ship(
    orderId: string,
    replacementId: string,
    actorId: string,
    dto: ShipReplacementDto,
  ) {
    return this.action(orderId, replacementId, actorId, dto, 'SHIP', dto)
  }
  deliver(
    orderId: string,
    replacementId: string,
    actorId: string,
    dto: ReplacementActionDto,
  ) {
    return this.action(orderId, replacementId, actorId, dto, 'DELIVER')
  }
  cancel(
    orderId: string,
    replacementId: string,
    actorId: string,
    dto: ReplacementActionDto,
  ) {
    return this.action(orderId, replacementId, actorId, dto, 'CANCEL')
  }

  async adminList(orderId: string) {
    const order = await this.database.client.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return (
      await this.database.client.orderReplacement.findMany({
        where: { orderId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map(present)
  }

  async customerList(orderId: string, customerId: string) {
    const order = await this.database.client.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return (
      await this.database.client.orderReplacement.findMany({
        where: { orderId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map(present)
  }
}
