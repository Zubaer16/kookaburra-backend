import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'

export type TrackingKind = 'ORDER' | 'SHIPMENT' | 'RETURN' | 'REPLACEMENT'
export type TrackingEvent = {
  id: string
  type: TrackingKind
  referenceId: string
  status: string
  occurredAt: Date
}

/** Stable timeline on identical timestamps; no client-side inference of payment or delivery. */
export function sortedTrackingEvents(events: TrackingEvent[]): TrackingEvent[] {
  return events.sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.id.localeCompare(b.id),
  )
}

const replacementActionStatus = {
  SHIP: 'SHIPPED',
  DELIVER: 'DELIVERED',
  CANCEL: 'CANCELLED',
} as const

@Injectable()
export class TrackingService {
  constructor(private readonly database: DatabaseService) {}

  customerGet(orderId: string, customerId: string) {
    return this.read(orderId, customerId)
  }
  adminGet(orderId: string) {
    return this.read(orderId)
  }

  /** A repeatable-read projection prevents mixing states from different concurrent transitions.
   * Order ownership is checked in the same SQL query as all nested relations;
   * querying another customer's UUID is indistinguishable from an absent order.
   */
  private async read(orderId: string, customerId?: string) {
    return this.database.client.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, ...(customerId ? { customerId } : {}) },
          select: {
            id: true,
            status: true,
            createdAt: true,
            statusEvents: {
              select: { id: true, status: true, createdAt: true },
            },
            shipment: {
              select: {
                id: true,
                status: true,
                carrier: true,
                trackingNumber: true,
                shippedAt: true,
                deliveredAt: true,
                startedAt: true,
                events: { select: { id: true, status: true, createdAt: true } },
              },
            },
            returnRequests: {
              select: {
                id: true,
                orderLineId: true,
                quantity: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                events: { select: { id: true, status: true, createdAt: true } },
              },
            },
            replacements: {
              select: {
                id: true,
                returnId: true,
                quantity: true,
                status: true,
                carrier: true,
                trackingNumber: true,
                shippedAt: true,
                deliveredAt: true,
                createdAt: true,
                events: { select: { id: true, action: true, createdAt: true } },
              },
            },
          },
        })
        if (!order) throw new NotFoundException('Order not found')
        const events: TrackingEvent[] = [
          {
            id: order.id,
            referenceId: order.id,
            type: 'ORDER',
            status: 'PENDING_PAYMENT',
            occurredAt: order.createdAt,
          },
        ]
        for (const item of order.statusEvents) {
          events.push({
            id: item.id,
            type: 'ORDER',
            referenceId: order.id,
            status: item.status,
            occurredAt: item.createdAt,
          })
        }
        if (order.shipment) {
          const shipment = order.shipment
          // For a legacy shipment without status events, preserve its start date.
          if (!shipment.events.some((item) => item.status === 'PROCESSING')) {
            events.push({
              id: shipment.id,
              type: 'SHIPMENT',
              referenceId: shipment.id,
              status: 'PROCESSING',
              occurredAt: shipment.startedAt,
            })
          }
          for (const item of shipment.events) {
            events.push({
              id: item.id,
              type: 'SHIPMENT',
              referenceId: shipment.id,
              status: item.status,
              occurredAt: item.createdAt,
            })
          }
        }
        for (const ret of order.returnRequests) {
          events.push({
            id: ret.id,
            type: 'RETURN',
            referenceId: ret.id,
            status: 'REQUESTED',
            occurredAt: ret.createdAt,
          })
          for (const item of ret.events) {
            events.push({
              id: item.id,
              type: 'RETURN',
              referenceId: ret.id,
              status: item.status,
              occurredAt: item.createdAt,
            })
          }
        }
        for (const replacement of order.replacements) {
          events.push({
            id: replacement.id,
            type: 'REPLACEMENT',
            referenceId: replacement.id,
            status: 'AUTHORIZED',
            occurredAt: replacement.createdAt,
          })
          for (const item of replacement.events) {
            const status =
              replacementActionStatus[
                item.action as keyof typeof replacementActionStatus
              ]
            if (status) {
              events.push({
                id: item.id,
                type: 'REPLACEMENT',
                referenceId: replacement.id,
                status,
                occurredAt: item.createdAt,
              })
            }
          }
        }
        return {
          orderId: order.id,
          orderStatus: order.status,
          originalShipment: order.shipment
            ? {
                id: order.shipment.id,
                status: order.shipment.status,
                carrier: order.shipment.carrier,
                trackingNumber: order.shipment.trackingNumber,
                shippedAt: order.shipment.shippedAt,
                deliveredAt: order.shipment.deliveredAt,
              }
            : null,
          returns: order.returnRequests
            .map((ret) => ({
              id: ret.id,
              orderLineId: ret.orderLineId,
              quantity: ret.quantity,
              status: ret.status,
              updatedAt: ret.updatedAt,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
          replacements: order.replacements
            .map((item) => ({
              id: item.id,
              returnId: item.returnId,
              quantity: item.quantity,
              status: item.status,
              carrier: item.carrier,
              trackingNumber: item.trackingNumber,
              shippedAt: item.shippedAt,
              deliveredAt: item.deliveredAt,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
          events: sortedTrackingEvents(events),
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 10000,
      },
    )
  }
}
