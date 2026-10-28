import { createHash } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import {
  FulfillmentActionDto,
  FulfillmentOrderQueryDto,
  FulfillmentShipDto,
} from './fulfillment.dto'

const dbTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 15000,
} as const

function fingerprint(
  status: 'PROCESSING' | 'SHIPPED' | 'DELIVERED',
  carrier?: string,
  trackingNumber?: string,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        status,
        carrier: carrier ?? null,
        trackingNumber: trackingNumber ?? null,
      }),
    )
    .digest('hex')
}

export function presentShipment(
  shipment: {
    id: string
    status: string
    carrier: string | null
    trackingNumber: string | null
    startedAt: Date
    shippedAt: Date | null
    deliveredAt: Date | null
  } | null,
) {
  return shipment
    ? {
        id: shipment.id,
        status: shipment.status,
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        startedAt: shipment.startedAt,
        shippedAt: shipment.shippedAt,
        deliveredAt: shipment.deliveredAt,
      }
    : null
}

@Injectable()
export class FulfillmentService {
  constructor(private readonly database: DatabaseService) {}

  /** All mutations first acquire the Order FOR UPDATE lock, shared with payments. */
  private async transition(
    orderId: string,
    actorId: string,
    input: FulfillmentActionDto,
    desired: 'PROCESSING' | 'SHIPPED' | 'DELIVERED',
    shipping?: FulfillmentShipDto,
  ) {
    const carrier = shipping?.carrier.trim()
    const trackingNumber = shipping?.trackingNumber.trim()
    const requestHash = fingerprint(desired, carrier, trackingNumber)
    return this.database.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `
      if (!locked.length) throw new NotFoundException('Order not found')
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          shipment: true,
          paymentTransaction: { select: { id: true } },
        },
      })
      const previous = await tx.orderShipmentEvent.findUnique({
        where: { orderId_requestId: { orderId, requestId: input.requestId } },
      })
      // A known, identical retry returns the current shipment without repeating a transition.
      if (previous) {
        if (previous.requestHash !== requestHash || previous.status !== desired)
          throw new ConflictException(
            'Fulfillment request UUID reused with different details',
          )
        return presentShipment(order.shipment)
      }
      if (order.status !== 'PAID' || !order.paidAt || !order.paymentTransaction)
        throw new ConflictException(
          'Only verified paid orders may be fulfilled',
        )
      // A refund can invalidate physical fulfillment eligibility; resolve it first.
      const refundExists = await tx.refundRequest.findFirst({
        where: { orderId },
        select: { id: true },
      })
      if (refundExists)
        throw new ConflictException(
          'Order has a refund request; review before fulfillment',
        )
      if (desired === 'PROCESSING') {
        if (order.shipment)
          throw new ConflictException('Fulfillment already started')
      } else if (desired === 'SHIPPED') {
        if (!order.shipment || order.shipment.status !== 'PROCESSING')
          throw new ConflictException(
            'Order must be processing before shipping',
          )
        if (!carrier || !trackingNumber)
          throw new ConflictException('Carrier and tracking are required')
      } else if (!order.shipment || order.shipment.status !== 'SHIPPED') {
        throw new ConflictException('Order must be shipped before delivery')
      }
      const now = new Date()
      const shipment =
        desired === 'PROCESSING'
          ? await tx.orderShipment.create({ data: { orderId } })
          : await tx.orderShipment.update({
              where: { orderId },
              data:
                desired === 'SHIPPED'
                  ? { status: desired, carrier, trackingNumber, shippedAt: now }
                  : { status: desired, deliveredAt: now },
            })
      await tx.orderShipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          orderId,
          requestId: input.requestId,
          requestHash,
          status: desired,
          actorId,
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId,
          action: `order.fulfillment.${desired.toLowerCase()}`,
          targetType: 'order',
          targetId: orderId,
        },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: `order.fulfillment.${desired.toLowerCase()}`,
          payload: {
            orderId,
            customerId: order.customerId,
            shipmentId: shipment.id,
            status: desired,
          },
        },
      })
      return presentShipment(shipment)
    }, dbTransactionOptions)
  }

  start(id: string, actorId: string, dto: FulfillmentActionDto) {
    return this.transition(id, actorId, dto, 'PROCESSING')
  }
  ship(id: string, actorId: string, dto: FulfillmentShipDto) {
    return this.transition(id, actorId, dto, 'SHIPPED', dto)
  }
  deliver(id: string, actorId: string, dto: FulfillmentActionDto) {
    return this.transition(id, actorId, dto, 'DELIVERED')
  }
  async get(id: string) {
    const order = await this.database.client.order.findUnique({
      where: { id },
      include: { shipment: true, lines: { orderBy: { id: 'asc' } } },
    })
    if (!order) throw new NotFoundException('Order not found')
    return {
      id: order.id,
      customerId: order.customerId,
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
      createdAt: order.createdAt,
      lines: order.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        title: line.titleSnapshot,
        sku: line.skuSnapshot,
        optionsSnapshotJson: line.optionsSnapshotJson,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
      fulfillment: presentShipment(order.shipment),
    }
  }
  async list(query: FulfillmentOrderQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const [orders, total] = await this.database.client.$transaction([
      this.database.client.order.findMany({
        include: { shipment: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.database.client.order.count(),
    ])
    return {
      items: orders.map((order) => ({
        id: order.id,
        customerId: order.customerId,
        status: order.status,
        currency: order.currency,
        totalMinor: order.totalMinor,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
        fulfillment: presentShipment(order.shipment),
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }
  }
}
