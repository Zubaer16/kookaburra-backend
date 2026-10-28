import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { StripeTestGateway, VerifiedStripeRefund } from './stripe-gateway'

const LEASE_MS = 90_000
const MAX_ATTEMPTS = 7
const MAX_BATCH = 25
// Stripe idempotency keys may be pruned after 24 hours. Stop earlier if the
// provider response was lost and no refund ID was durably recorded.
const MAX_UNKNOWN_ID_AGE_MS = 22 * 60 * 60 * 1000

type Outcome = 'SUCCEEDED' | 'FAILED' | 'REVIEW' | 'RETRY' | 'SKIPPED'

/**
 * An explicit operator worker, never invoked by a browser request.
 * Stripe is always queried outside DB transactions. The only source of truth
 * for SUCCEEDED / FAILED is a freshly retrieved provider refund object.
 */
@Injectable()
export class RefundExecutionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly gateway: StripeTestGateway,
  ) {}

  private enabled() {
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !this.config.get('STRIPE_TEST_REFUNDS_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'production'
    )
      throw new ServiceUnavailableException(
        'Stripe TEST refund execution is disabled',
      )
  }

  async processBatch(limit = 10) {
    this.enabled()
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH)
      throw new Error('Invalid refund batch size')
    const now = new Date()
    const candidates = await this.db.client.refundRequest.findMany({
      where: {
        retryAt: { lte: now },
        OR: [
          { status: 'REQUESTED' },
          {
            status: 'PROCESSING',
            OR: [
              { processingStartedAt: null },
              {
                processingStartedAt: { lt: new Date(now.getTime() - LEASE_MS) },
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    })
    const result = {
      checked: candidates.length,
      succeeded: 0,
      failed: 0,
      review: 0,
      retry: 0,
      skipped: 0,
    }
    for (const row of candidates) {
      const outcome = await this.process(row.id)
      if (outcome === 'SUCCEEDED') result.succeeded++
      else if (outcome === 'FAILED') result.failed++
      else if (outcome === 'REVIEW') result.review++
      else if (outcome === 'RETRY') result.retry++
      else result.skipped++
    }
    return result
  }

  async process(id: string): Promise<Outcome> {
    this.enabled()
    const now = new Date()
    const claimed = await this.db.client.refundRequest.updateMany({
      where: {
        id,
        retryAt: { lte: now },
        OR: [
          { status: 'REQUESTED' },
          {
            status: 'PROCESSING',
            OR: [
              { processingStartedAt: null },
              {
                processingStartedAt: { lt: new Date(now.getTime() - LEASE_MS) },
              },
            ],
          },
        ],
      },
      data: {
        status: 'PROCESSING',
        processingStartedAt: now,
        retryAt: new Date(now.getTime() + LEASE_MS),
        attempts: { increment: 1 },
      },
    })
    if (claimed.count !== 1) return 'SKIPPED'
    const row = await this.db.client.refundRequest.findUniqueOrThrow({
      where: { id },
      include: { paymentTransaction: true, order: true },
    })
    if (
      row.order.status !== 'PAID' ||
      !row.order.paidAt ||
      row.paymentTransaction.orderId !== row.orderId ||
      row.paymentTransaction.id !== row.paymentTransactionId ||
      row.paymentTransaction.currency !== row.currency ||
      row.amountMinor < 1 ||
      row.amountMinor > row.paymentTransaction.amountMinor ||
      !row.paymentTransaction.providerIntentId
    )
      return this.review(id, 'INTERNAL_INVARIANT')

    let refundId = row.providerRefundId
    if (!refundId) {
      if (
        row.firstSubmittedAt &&
        now.getTime() - row.firstSubmittedAt.getTime() >= MAX_UNKNOWN_ID_AGE_MS
      )
        return this.review(id, 'UNKNOWN_PROVIDER_REFUND')
      // Persist the very first provider attempt timestamp BEFORE the network
      // call, otherwise a crash can silently reset the 22-hour replay fence.
      if (!row.firstSubmittedAt)
        await this.db.client.refundRequest.updateMany({
          where: { id, status: 'PROCESSING', firstSubmittedAt: null },
          data: { firstSubmittedAt: now },
        })
      let created: VerifiedStripeRefund
      try {
        created = await this.gateway.createRefund({
          refundRequestId: row.id,
          orderId: row.orderId,
          paymentIntentId: row.paymentTransaction.providerIntentId,
          amountMinor: row.amountMinor,
          currency: row.currency,
          reason: row.reason,
          idempotencyKey: `kb-test-refund-${row.id}`,
        })
      } catch {
        // The request may have succeeded while its HTTP response was lost.
        // Retry only with the SAME key inside the provider retention window.
        return this.retryOrReview(id, row.attempts)
      }
      if (!this.matches(row, created)) return this.review(id, 'CREATE_MISMATCH')
      refundId = created.id
      const saved = await this.db.client.refundRequest.updateMany({
        where: { id, status: 'PROCESSING', providerRefundId: null },
        data: { providerRefundId: refundId, providerStatus: created.status },
      })
      if (saved.count !== 1) return this.review(id, 'IDENTITY_CONFLICT')
    }

    let verified: VerifiedStripeRefund
    try {
      verified = await this.gateway.retrieveRefund(refundId)
    } catch {
      return this.retryOrReview(id, row.attempts)
    }
    if (!this.matches(row, verified) || verified.id !== refundId)
      return this.review(id, 'PROVIDER_MISMATCH')
    if (verified.status === 'succeeded')
      return this.finish(id, 'SUCCEEDED', verified.status)
    if (verified.status === 'failed' || verified.status === 'canceled')
      return this.finish(id, 'FAILED', verified.status)
    if (verified.status === 'pending')
      return this.retryOrReview(id, row.attempts)
    return this.review(id, 'UNKNOWN_PROVIDER_STATUS')
  }

  private matches(
    row: {
      id: string
      orderId: string
      amountMinor: number
      currency: string
      paymentTransaction: { providerIntentId: string }
    },
    provider: VerifiedStripeRefund,
  ) {
    return (
      provider.livemode === false &&
      /^re_[A-Za-z0-9]{6,120}$/.test(provider.id) &&
      provider.paymentIntentId === row.paymentTransaction.providerIntentId &&
      provider.orderId === row.orderId &&
      provider.refundRequestId === row.id &&
      provider.amountMinor === row.amountMinor &&
      provider.currency === row.currency
    )
  }

  private async finish(
    id: string,
    state: 'SUCCEEDED' | 'FAILED',
    providerStatus: string,
  ): Promise<Outcome> {
    const outcome = await this.db.client.$transaction(
      async (tx) => {
        const initial = await tx.refundRequest.findUniqueOrThrow({
          where: { id },
          select: { orderId: true },
        })
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.orderId}::uuid FOR UPDATE`
        const latest = await tx.refundRequest.findUniqueOrThrow({
          where: { id },
        })
        if (latest.status !== 'PROCESSING') return 'SKIPPED' as const
        if (!latest.providerRefundId) return 'SKIPPED' as const
        await tx.refundRequest.update({
          where: { id },
          data: {
            status: state,
            providerStatus,
            confirmedAt: new Date(),
            processingStartedAt: null,
          },
        })
        await tx.outboxEvent.create({
          data: {
            eventType:
              state === 'SUCCEEDED'
                ? 'payment.test_refund_succeeded'
                : 'payment.test_refund_failed',
            payload: {
              orderId: latest.orderId,
              refundRequestId: id,
              amountMinor: latest.amountMinor,
              currency: latest.currency,
            },
          },
        })
        return state
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    )
    return outcome
  }

  private async retryOrReview(
    id: string,
    attempts: number,
  ): Promise<'RETRY' | 'REVIEW'> {
    if (attempts >= MAX_ATTEMPTS) return this.review(id, 'MAX_ATTEMPTS')
    const delay = Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7))
    await this.db.client.refundRequest.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        processingStartedAt: null,
        retryAt: new Date(Date.now() + delay),
      },
    })
    return 'RETRY'
  }

  private async review(id: string, reason: string): Promise<'REVIEW'> {
    await this.db.client.$transaction(async (tx) => {
      const row = await tx.refundRequest.findUnique({ where: { id } })
      if (!row || row.status !== 'PROCESSING') return
      await tx.refundRequest.update({
        where: { id },
        data: { status: 'REQUIRES_REVIEW', processingStartedAt: null },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: 'payment.test_refund_review_required',
          payload: { orderId: row.orderId, refundRequestId: id, reason },
        },
      })
    })
    return 'REVIEW'
  }
}
