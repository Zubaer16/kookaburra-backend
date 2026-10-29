import { createHash } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import {
  CreateOrderReturnDto,
  ReceiveReturnDto,
  ReturnActionDto,
} from './returns.dto'

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 15000,
} as const

function sha(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function present(row: {
  id: string
  orderId: string
  orderLineId: string
  quantity: number
  reason: string
  status: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    orderId: row.orderId,
    orderLineId: row.orderLineId,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

@Injectable()
export class ReturnsService {
  constructor(private readonly database: DatabaseService) {}

  // Lock ordering shared with Fulfillment and Settlement: order, then return,
  // then inventory balance. Never lock an inventory balance before an order.
  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `
    if (!locked.length) throw new NotFoundException('Order not found')
  }

  async request(
    customerId: string,
    orderId: string,
    input: CreateOrderReturnDto,
  ) {
    const hash = sha({
      orderLineId: input.orderLineId,
      quantity: input.quantity,
      reason: input.reason,
    })
    // No cross-customer information disclosure, even for invalid order IDs.
    const own = await this.database.client.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    })
    if (!own) throw new NotFoundException('Order not found')
    return this.database.client.$transaction(async (tx) => {
      await this.lockOrder(tx, orderId)
      const existing = await tx.orderReturn.findUnique({
        where: { orderId_requestId: { orderId, requestId: input.requestId } },
      })
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException(
            'Return request UUID reused with different details',
          )
        return present(existing)
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { shipment: true },
      })
      if (order.customerId !== customerId)
        throw new NotFoundException('Order not found')
      if (order.status !== 'PAID' || order.shipment?.status !== 'DELIVERED')
        throw new ConflictException(
          'Return requests require a paid, delivered order',
        )
      const line = await tx.orderLine.findFirst({
        where: { id: input.orderLineId, orderId },
      })
      if (!line) throw new NotFoundException('Order line not found')
      const previouslyRequested = await tx.orderReturn.aggregate({
        where: { orderLineId: line.id, status: { not: 'REJECTED' } },
        _sum: { quantity: true },
      })
      if (
        input.quantity >
        line.quantity - (previouslyRequested._sum.quantity ?? 0)
      )
        throw new ConflictException(
          'Return quantity exceeds unreturned order line quantity',
        )
      const created = await tx.orderReturn.create({
        data: {
          orderId,
          orderLineId: line.id,
          requestId: input.requestId,
          requestHash: hash,
          quantity: input.quantity,
          reason: input.reason,
        },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: 'order.return.requested',
          payload: {
            orderId,
            customerId,
            returnId: created.id,
            status: 'REQUESTED',
          },
        },
      })
      return present(created)
    }, transactionOptions)
  }

  async customerList(customerId: string, orderId: string) {
    const order = await this.database.client.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return (
      await this.database.client.orderReturn.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      })
    ).map(present)
  }

  async adminList(orderId: string) {
    const order = await this.database.client.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return (
      await this.database.client.orderReturn.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      })
    ).map(present)
  }

  private async action(
    orderId: string,
    returnId: string,
    actorId: string,
    input: ReturnActionDto,
    action: 'APPROVE' | 'REJECT' | 'RECEIVE' | 'RESTOCK',
    condition?: 'RESTOCKABLE' | 'DAMAGED',
  ) {
    const hash = sha({ action, condition: condition ?? null })
    return this.database.client.$transaction(async (tx) => {
      await this.lockOrder(tx, orderId)
      const row = await tx.orderReturn.findFirst({
        where: { id: returnId, orderId },
        include: { orderLine: true },
      })
      if (!row) throw new NotFoundException('Return not found')
      // Order lock serializes every status transition, quantity reservation and
      // restock; a successful action replay returns the current state.
      const old = await tx.orderReturnEvent.findUnique({
        where: { returnId_requestId: { returnId, requestId: input.requestId } },
      })
      if (old) {
        if (old.actionHash !== hash || old.action !== action)
          throw new ConflictException(
            'Return action UUID reused with different details',
          )
        return present(row)
      }
      const desired =
        action === 'APPROVE'
          ? 'APPROVED'
          : action === 'REJECT'
            ? 'REJECTED'
            : action === 'RECEIVE'
              ? condition === 'RESTOCKABLE'
                ? 'RECEIVED_RESTOCKABLE'
                : 'RECEIVED_DAMAGED'
              : 'RESTOCKED'
      if (
        (action === 'APPROVE' || action === 'REJECT') &&
        row.status !== 'REQUESTED'
      )
        throw new ConflictException(
          'Only requested returns can be approved or rejected',
        )
      if (action === 'RECEIVE' && row.status !== 'APPROVED')
        throw new ConflictException(
          'Return must be approved before physical inspection',
        )
      if (action === 'RESTOCK' && row.status !== 'RECEIVED_RESTOCKABLE')
        throw new ConflictException(
          'Only inspected restockable returns can be restocked',
        )
      if (action === 'RESTOCK') {
        const line = row.orderLine
        const balance = await tx.inventoryBalance.findFirst({
          where: line.variantId
            ? { variantId: line.variantId }
            : { productId: line.productId },
          include: { product: true, variant: true },
        })
        if (
          !balance ||
          (line.variantId
            ? balance.variant?.productId !== line.productId ||
              balance.variant?.sku !== line.skuSnapshot
            : !balance.product ||
              balance.product.hasVariants ||
              balance.product.sku !== line.skuSnapshot)
        )
          throw new ConflictException(
            'Original SKU cannot be safely restocked; manual inventory review required',
          )
        const changed = await tx.$queryRaw<Array<{ on_hand: number }>>`
          UPDATE inventory_balances
          SET on_hand = on_hand + ${row.quantity}, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          WHERE id = ${balance.id}::uuid AND on_hand::bigint + ${row.quantity} <= 2147483647
          RETURNING on_hand
        `
        if (!changed.length)
          throw new ConflictException('Restock would exceed inventory limit')
        const after = changed[0]!.on_hand
        if (balance.variantId)
          await tx.productVariant.update({
            where: { id: balance.variantId },
            data: { stockOnHand: after },
          })
        else if (balance.productId)
          await tx.product.update({
            where: { id: balance.productId },
            data: { stockOnHand: after },
          })
        await tx.inventoryMovement.create({
          data: {
            balanceId: balance.id,
            requestId: row.id,
            reason: 'RETURN',
            delta: row.quantity,
            before: after - row.quantity,
            after,
            note: `Inspected return ${row.id}`,
            actorId,
          },
        })
      }
      const updated = await tx.orderReturn.update({
        where: { id: returnId },
        data: { status: desired },
      })
      await tx.orderReturnEvent.create({
        data: {
          returnId,
          requestId: input.requestId,
          action,
          actionHash: hash,
          status: desired,
          actorId,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: `order.return.${action.toLowerCase()}`,
          targetType: 'order_return',
          targetId: returnId,
        },
      })
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { customerId: true },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: `order.return.${action.toLowerCase()}`,
          payload: {
            orderId,
            customerId: order.customerId,
            returnId,
            status: desired,
          },
        },
      })
      return present(updated)
    }, transactionOptions)
  }

  approve(
    orderId: string,
    returnId: string,
    actorId: string,
    dto: ReturnActionDto,
  ) {
    return this.action(orderId, returnId, actorId, dto, 'APPROVE')
  }
  reject(
    orderId: string,
    returnId: string,
    actorId: string,
    dto: ReturnActionDto,
  ) {
    return this.action(orderId, returnId, actorId, dto, 'REJECT')
  }
  receive(
    orderId: string,
    returnId: string,
    actorId: string,
    dto: ReceiveReturnDto,
  ) {
    return this.action(
      orderId,
      returnId,
      actorId,
      dto,
      'RECEIVE',
      dto.condition,
    )
  }
  restock(
    orderId: string,
    returnId: string,
    actorId: string,
    dto: ReturnActionDto,
  ) {
    return this.action(orderId, returnId, actorId, dto, 'RESTOCK')
  }
}
