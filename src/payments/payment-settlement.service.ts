import { createHash } from 'node:crypto'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { StripeTestGateway, VerifiedStripeIntentState } from './stripe-gateway'

const LEASE_MS = 90_000
const MAX_RETRIES = 7
const MAX_BATCH = 50

type Transaction = Prisma.TransactionClient

// Deterministic inventory movement request identity. Safe to replay the same
// provider event/worker call, without coupling inventory to provider event IDs.
function saleRequestId(orderId: string, balanceId: string): string {
  const value = createHash('sha256')
    .update(`kookaburra:sale:${orderId}:${balanceId}`)
    .digest()
  value[6] = (value[6]! & 0x0f) | 0x40
  value[8] = (value[8]! & 0x3f) | 0x80
  const hex = value.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

@Injectable()
export class PaymentSettlementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly gateway: StripeTestGateway,
  ) {}

  private enabled() {
    if (!this.config.get('STRIPE_TEST_ENABLED', { infer: true }))
      throw new ServiceUnavailableException(
        'Stripe TEST reconciliation is disabled',
      )
  }

  /** Operator/scheduler entrypoint. Never uses provider status supplied in a webhook. */
  async reconcileBatch(limit = 25) {
    this.enabled()
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH)
      throw new Error('Invalid Stripe reconciliation batch size')
    const now = new Date()
    const receipts = await this.db.client.paymentWebhookReceipt.findMany({
      where: {
        eventType: 'payment_intent.succeeded',
        retryAt: { lte: now },
        OR: [
          { status: 'RECEIVED' },
          {
            status: 'PROCESSING',
            processingAt: { lt: new Date(now.getTime() - LEASE_MS) },
          },
        ],
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    })
    let settled = 0
    let reviewed = 0
    let retry = 0
    let skipped = 0
    for (const receipt of receipts) {
      const outcome = await this.reconcileReceipt(receipt.id)
      if (outcome === 'SETTLED') settled++
      else if (outcome === 'REVIEW') reviewed++
      else if (outcome === 'RETRY') retry++
      else skipped++
    }
    return { checked: receipts.length, settled, reviewed, retry, skipped }
  }

  /** Testable with a fake provider; only live worker enables it with test keys. */
  async reconcileReceipt(
    receiptId: string,
  ): Promise<'SETTLED' | 'REVIEW' | 'RETRY' | 'SKIPPED'> {
    this.enabled()
    const now = new Date()
    const claim = await this.db.client.paymentWebhookReceipt.updateMany({
      where: {
        id: receiptId,
        eventType: 'payment_intent.succeeded',
        retryAt: { lte: now },
        OR: [
          { status: 'RECEIVED' },
          {
            status: 'PROCESSING',
            processingAt: { lt: new Date(now.getTime() - LEASE_MS) },
          },
        ],
      },
      data: {
        status: 'PROCESSING',
        processingAt: now,
        attempts: { increment: 1 },
      },
    })
    if (claim.count === 0) return 'SKIPPED'
    const receipt =
      await this.db.client.paymentWebhookReceipt.findUniqueOrThrow({
        where: { id: receiptId },
      })
    if (!receipt.providerIntentId) {
      await this.flagReview(receiptId, null)
      return 'REVIEW'
    }
    let provider: VerifiedStripeIntentState
    try {
      provider = await this.gateway.retrieve(receipt.providerIntentId)
    } catch {
      return this.retryOrReview(receiptId, receipt.attempts)
    }
    if (
      provider.id !== receipt.providerIntentId ||
      provider.livemode !== false ||
      provider.status !== 'succeeded'
    )
      return this.retryOrReview(receiptId, receipt.attempts)
    try {
      return await this.db.client.$transaction(
        async (tx) => this.settleWithLock(tx, receiptId, provider),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 20000,
        },
      )
    } catch {
      // Roll back ALL inventory/order changes on any constraint or network-independent
      // failure; leave a receipt that the operator can safely retry.
      return this.retryOrReview(receiptId, receipt.attempts)
    }
  }

  private async retryOrReview(
    id: string,
    attempts: number,
  ): Promise<'RETRY' | 'REVIEW'> {
    if (attempts >= MAX_RETRIES) {
      await this.flagReview(id, null)
      return 'REVIEW'
    }
    const delayMs = Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7))
    await this.db.client.paymentWebhookReceipt.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: 'RECEIVED',
        processingAt: null,
        retryAt: new Date(Date.now() + delayMs),
      },
    })
    return 'RETRY'
  }

  private async flagReview(id: string, attemptId: string | null) {
    await this.db.client.$transaction(async (tx) => {
      const receipt = await tx.paymentWebhookReceipt.findUnique({
        where: { id },
      })
      if (!receipt || receipt.status !== 'PROCESSING') return
      await tx.paymentWebhookReceipt.update({
        where: { id },
        data: {
          status: 'REQUIRES_REVIEW',
          processedAt: new Date(),
          processingAt: null,
        },
      })
      if (attemptId)
        await tx.paymentAttempt.updateMany({
          where: { id: attemptId, status: { not: 'SETTLED' } },
          data: { status: 'REQUIRES_REVIEW' },
        })
      await tx.outboxEvent.create({
        data: {
          eventType: 'payment.test_review_required',
          payload: { providerEventId: receipt.providerEventId },
        },
      })
    })
  }

  private async markReviewLocked(
    tx: Transaction,
    receiptId: string,
    attemptId: string | null,
    orderId?: string,
  ) {
    await tx.paymentWebhookReceipt.update({
      where: { id: receiptId },
      data: {
        status: 'REQUIRES_REVIEW',
        processedAt: new Date(),
        processingAt: null,
      },
    })
    if (attemptId)
      await tx.paymentAttempt.updateMany({
        where: { id: attemptId, status: { not: 'SETTLED' } },
        data: { status: 'REQUIRES_REVIEW' },
      })
    await tx.outboxEvent.create({
      data: {
        eventType: 'payment.test_review_required',
        payload: { receiptId, ...(orderId ? { orderId } : {}) },
      },
    })
    return 'REVIEW' as const
  }

  private async settleWithLock(
    tx: Transaction,
    receiptId: string,
    provider: VerifiedStripeIntentState,
  ): Promise<'SETTLED' | 'REVIEW' | 'SKIPPED'> {
    const receipt = await tx.paymentWebhookReceipt.findUniqueOrThrow({
      where: { id: receiptId },
    })
    if (receipt.status !== 'PROCESSING') return 'SKIPPED'
    const attempt = await tx.paymentAttempt.findUnique({
      where: { providerIntentId: provider.id },
    })
    if (!attempt) return this.markReviewLocked(tx, receiptId, null)
    // Always lock order BEFORE touching balances: cancel/expiry use the same sequence.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${attempt.orderId}::uuid FOR UPDATE`
    const order = await tx.order.findUniqueOrThrow({
      where: { id: attempt.orderId },
    })
    const settled = await tx.paymentTransaction.findUnique({
      where: { orderId: order.id },
    })
    if (order.status === 'PAID') {
      if (
        !settled ||
        settled.providerIntentId !== provider.id ||
        settled.amountMinor !== provider.amountReceivedMinor ||
        settled.currency !== provider.currency ||
        provider.orderId !== order.id ||
        settled.amountMinor !== provider.amountMinor ||
        attempt.provider !== 'STRIPE_TEST'
      )
        return this.markReviewLocked(tx, receiptId, attempt.id, order.id)
      await tx.paymentWebhookReceipt.update({
        where: { id: receiptId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          processingAt: null,
        },
      })
      return 'SETTLED'
    }
    // A late success MUST NEVER reopen expired/cancelled stock. Human refund/review.
    if (
      order.status !== 'PENDING_PAYMENT' ||
      order.paymentDeadlineAt <= new Date()
    )
      return this.markReviewLocked(tx, receiptId, attempt.id, order.id)
    if (
      attempt.provider !== 'STRIPE_TEST' ||
      attempt.providerIntentId !== provider.id ||
      attempt.amountMinor !== order.totalMinor ||
      attempt.currency !== order.currency ||
      provider.orderId !== order.id ||
      provider.currency !== order.currency ||
      provider.amountMinor !== order.totalMinor ||
      provider.amountReceivedMinor !== order.totalMinor ||
      provider.amountReceivedMinor <= 0
    )
      return this.markReviewLocked(tx, receiptId, attempt.id, order.id)
    const lines = await tx.checkoutReservationLine.findMany({
      where: { reservationId: order.reservationId },
      orderBy: { balanceId: 'asc' },
    })
    if (!lines.length) throw new Error('Missing order allocation lines')
    // Group by balance to avoid ordering collisions and duplicate movements.
    const balanceIds = [...new Set(lines.map((line) => line.balanceId))].sort()
    for (const balanceId of balanceIds) {
      const quantity = lines
        .filter((line) => line.balanceId === balanceId)
        .reduce((sum, line) => sum + line.quantity, 0)
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error('Invalid allocation quantity')
      const rows = await tx.$queryRaw<
        Array<{
          id: string
          on_hand: number
          product_id: string | null
          variant_id: string | null
        }>
      >`
        UPDATE inventory_balances SET on_hand = on_hand - ${quantity},
          reserved_quantity = reserved_quantity - ${quantity},
          updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE id = ${balanceId}::uuid AND reserved_quantity >= ${quantity} AND on_hand >= ${quantity}
        RETURNING id, on_hand, product_id, variant_id
      `
      if (rows.length !== 1)
        throw new Error('Inventory sale allocation integrity violation')
      const row = rows[0]!
      if (row.product_id)
        await tx.product.update({
          where: { id: row.product_id },
          data: { stockOnHand: row.on_hand },
        })
      else if (row.variant_id)
        await tx.productVariant.update({
          where: { id: row.variant_id },
          data: { stockOnHand: row.on_hand },
        })
      else throw new Error('Inventory identity missing')
      await tx.inventoryMovement.create({
        data: {
          balanceId,
          requestId: saleRequestId(order.id, balanceId),
          reason: 'SALE',
          delta: -quantity,
          before: row.on_hand + quantity,
          after: row.on_hand,
          note: 'Verified Stripe TEST payment settlement',
          actorId: null,
        },
      })
    }
    const paymentTransaction = await tx.paymentTransaction.create({
      data: {
        orderId: order.id,
        paymentAttemptId: attempt.id,
        providerIntentId: provider.id,
        amountMinor: order.totalMinor,
        currency: order.currency,
      },
    })
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'SETTLED' },
    })
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        statusEvents: {
          create: { status: 'PAID', reason: 'STRIPE_TEST_VERIFIED_SUCCEEDED' },
        },
      },
    })
    await tx.paymentWebhookReceipt.update({
      where: { id: receiptId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        processingAt: null,
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'payment.test_settled',
        payload: {
          orderId: order.id,
          paymentTransactionId: paymentTransaction.id,
        },
      },
    })
    return 'SETTLED'
  }
}
