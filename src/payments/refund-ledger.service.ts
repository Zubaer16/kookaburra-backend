import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import { CreateRefundRequestDto } from './refund-ledger.dto'

const BLOCKING_STATUSES = [
  'REQUESTED',
  'PROCESSING',
  'SUCCEEDED',
  'REQUIRES_REVIEW',
] as const

/** Ledger-only partial/full refund intents. Never calls Stripe or changes stock. */
@Injectable()
export class RefundLedgerService {
  constructor(private readonly db: DatabaseService) {}

  private display(record: {
    id: string
    orderId: string
    requestId: string
    amountMinor: number
    currency: string
    reason: string
    status: string
    providerRefundId?: string | null
  }) {
    return {
      id: record.id,
      orderId: record.orderId,
      requestId: record.requestId,
      amountMinor: record.amountMinor,
      currency: record.currency,
      reason: record.reason,
      status: record.status,
      providerRefundSubmitted: !!record.providerRefundId,
      stockReturned: false as const,
    }
  }

  async create(ownerId: string, orderId: string, dto: CreateRefundRequestDto) {
    return this.db.client.$transaction(
      async (tx) => {
        // Serializes all requests for the same order across processes.
        const locked = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
        if (!locked.length) throw new NotFoundException('Order not found')
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        })
        const settled = await tx.paymentTransaction.findUnique({
          where: { orderId },
        })
        if (
          order.status !== 'PAID' ||
          !settled ||
          !order.paidAt ||
          settled.amountMinor !== order.totalMinor ||
          settled.currency !== order.currency
        )
          throw new ConflictException(
            'Only verified paid orders are eligible for refund requests',
          )
        const previous = await tx.refundRequest.findUnique({
          where: { orderId_requestId: { orderId, requestId: dto.requestId } },
        })
        if (previous) {
          if (
            previous.amountMinor !== dto.amountMinor ||
            previous.reason !== dto.reason
          )
            throw new ConflictException(
              'Idempotency key reused with different refund parameters',
            )
          return this.display(previous)
        }
        const amounts = await tx.refundRequest.findMany({
          where: { orderId, status: { in: [...BLOCKING_STATUSES] } },
          select: { amountMinor: true },
        })
        const allocated = amounts.reduce((acc, row) => acc + row.amountMinor, 0)
        if (
          !Number.isSafeInteger(allocated) ||
          dto.amountMinor > settled.amountMinor - allocated
        )
          throw new ConflictException(
            'Refund request exceeds remaining eligible amount',
          )
        const record = await tx.refundRequest.create({
          data: {
            orderId,
            paymentTransactionId: settled.id,
            requestId: dto.requestId,
            amountMinor: dto.amountMinor,
            currency: settled.currency,
            reason: dto.reason,
            requestedById: ownerId,
          },
        })
        await tx.auditEvent.create({
          data: {
            actorId: ownerId,
            action: 'payment.refund_requested',
            targetType: 'order',
            targetId: orderId,
          },
        })
        await tx.outboxEvent.create({
          data: {
            eventType: 'payment.refund_requested',
            payload: {
              orderId,
              refundRequestId: record.id,
              amountMinor: record.amountMinor,
              currency: record.currency,
            },
          },
        })
        return this.display(record)
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    )
  }

  async listForOwner(orderId: string) {
    const order = await this.db.client.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    const records = await this.db.client.refundRequest.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return records.map((row) => this.display(row))
  }

  async listForCustomer(customerId: string, orderId: string) {
    const order = await this.db.client.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    const records = await this.db.client.refundRequest.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return records.map((row) => this.display(row))
  }
}
