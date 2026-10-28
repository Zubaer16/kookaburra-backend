import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { StripeTestGateway, VerifiedStripeIntentState } from './stripe-gateway'

const LEASE_MS = 90_000
const MAX_ATTEMPTS = 7
const MAX_BATCH = 50
const CLOSED_STATUSES = ['CANCELLED', 'EXPIRED'] as const

/**
 * Compensates for an already closed unpaid order's remote Stripe TEST intent.
 * Never cancels a PAID order; never touches inventory or payment transactions.
 * No database transaction spans a provider network request.
 */
@Injectable()
export class PaymentCancellationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly gateway: StripeTestGateway,
  ) {}

  private enabled() {
    if (!this.config.get('STRIPE_TEST_ENABLED', { infer: true }))
      throw new ServiceUnavailableException(
        'Stripe TEST cancellation is disabled',
      )
  }

  async cancelBatch(limit = 25) {
    this.enabled()
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH)
      throw new Error('Invalid cancellation batch size')
    const attempts = await this.db.client.paymentAttempt.findMany({
      where: {
        provider: 'STRIPE_TEST',
        providerIntentId: { not: null },
        order: { status: { in: [...CLOSED_STATUSES] } },
        cancellationRetryAt: { lte: new Date() },
        OR: [
          { status: 'READY' },
          {
            status: 'CANCELLING',
            OR: [
              { cancellationStartedAt: null },
              {
                cancellationStartedAt: { lt: new Date(Date.now() - LEASE_MS) },
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    })
    const summary = {
      checked: attempts.length,
      cancelled: 0,
      reviewed: 0,
      retry: 0,
      skipped: 0,
    }
    for (const attempt of attempts) {
      const outcome = await this.cancelAttempt(attempt.id)
      if (outcome === 'CANCELLED') summary.cancelled++
      else if (outcome === 'REVIEW') summary.reviewed++
      else if (outcome === 'RETRY') summary.retry++
      else summary.skipped++
    }
    return summary
  }

  async cancelAttempt(
    attemptId: string,
  ): Promise<'CANCELLED' | 'REVIEW' | 'RETRY' | 'SKIPPED'> {
    this.enabled()
    const now = new Date()
    const claim = await this.db.client.paymentAttempt.updateMany({
      where: {
        id: attemptId,
        provider: 'STRIPE_TEST',
        providerIntentId: { not: null },
        order: { status: { in: [...CLOSED_STATUSES] } },
        cancellationRetryAt: { lte: now },
        OR: [
          { status: 'READY' },
          {
            status: 'CANCELLING',
            OR: [
              { cancellationStartedAt: null },
              {
                cancellationStartedAt: {
                  lt: new Date(now.getTime() - LEASE_MS),
                },
              },
            ],
          },
        ],
      },
      data: {
        status: 'CANCELLING',
        cancellationStartedAt: now,
        cancellationRetryAt: new Date(now.getTime() + LEASE_MS),
        cancellationAttempts: { increment: 1 },
      },
    })
    if (claim.count !== 1) return 'SKIPPED'
    const attempt = await this.db.client.paymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { order: { select: { status: true } } },
    })
    if (
      !attempt.providerIntentId ||
      !CLOSED_STATUSES.includes(
        attempt.order.status as (typeof CLOSED_STATUSES)[number],
      )
    )
      return this.markReview(attemptId)

    let provider: VerifiedStripeIntentState
    try {
      provider = await this.gateway.cancel(
        attempt.providerIntentId,
        attempt.order.status === 'CANCELLED'
          ? 'requested_by_customer'
          : 'abandoned',
      )
    } catch {
      // Stripe may have already performed cancellation even if the response was
      // lost; retrieve the real provider status before deciding to retry.
      try {
        provider = await this.gateway.retrieve(attempt.providerIntentId)
      } catch {
        return this.retryOrReview(attemptId, attempt.cancellationAttempts)
      }
    }
    if (
      provider.id !== attempt.providerIntentId ||
      provider.livemode !== false ||
      provider.orderId !== attempt.orderId ||
      provider.currency !== attempt.currency ||
      provider.amountMinor !== attempt.amountMinor
    )
      return this.markReview(attemptId)
    if (provider.status === 'succeeded' || provider.amountReceivedMinor > 0)
      return this.markReview(attemptId)
    if (provider.status !== 'canceled')
      return this.retryOrReview(attemptId, attempt.cancellationAttempts)

    const updated = await this.db.client.$transaction(
      async (tx) => {
        // Cancellation does not change financial or stock balances. Recheck state
        // under order lock to avoid overwriting a concurrently settled attempt.
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${attempt.orderId}::uuid FOR UPDATE`
        const fresh = await tx.paymentAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          include: { order: true },
        })
        if (
          fresh.status !== 'CANCELLING' ||
          !CLOSED_STATUSES.includes(
            fresh.order.status as (typeof CLOSED_STATUSES)[number],
          )
        )
          return false
        await tx.paymentAttempt.update({
          where: { id: attemptId },
          data: { status: 'CANCELLED', cancellationStartedAt: null },
        })
        await tx.outboxEvent.create({
          data: {
            eventType: 'payment.test_intent_cancelled',
            payload: { orderId: attempt.orderId, paymentAttemptId: attemptId },
          },
        })
        return true
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    )
    return updated ? 'CANCELLED' : 'SKIPPED'
  }

  private async retryOrReview(
    id: string,
    attempts: number,
  ): Promise<'RETRY' | 'REVIEW'> {
    if (attempts >= MAX_ATTEMPTS) return this.markReview(id)
    const delayMs = Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7))
    await this.db.client.paymentAttempt.updateMany({
      where: { id, status: 'CANCELLING' },
      data: {
        cancellationStartedAt: null,
        cancellationRetryAt: new Date(Date.now() + delayMs),
      },
    })
    // Stale lease recovery also covers a process crash after the provider call.
    return 'RETRY'
  }

  private async markReview(id: string): Promise<'REVIEW'> {
    await this.db.client.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findUnique({ where: { id } })
      if (!attempt || attempt.status !== 'CANCELLING') return
      await tx.paymentAttempt.update({
        where: { id },
        data: { status: 'REQUIRES_REVIEW', cancellationStartedAt: null },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: 'payment.test_review_required',
          payload: {
            orderId: attempt.orderId,
            paymentAttemptId: id,
            reason: 'CANCELLATION',
          },
        },
      })
    })
    return 'REVIEW'
  }
}
