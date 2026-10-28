import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../generated/prisma/client'
import { DatabaseService } from '../database/database.service'
import { Environment } from '../config/environment'
import { StripeTestGateway, VerifiedStripeIntentState } from './stripe-gateway'

const LEASE_MS = 90_000
const MAX_ATTEMPTS = 7
const SAFE_STATUSES = ['READY', 'CONFIRMING', 'CAPTURING'] as const

/** TEST-only fixed card simulation. Settlement remains signed-webhook driven.
 * No database transaction is open during a provider HTTP request.
 */
@Injectable()
export class PaymentTestCompletionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly gateway: StripeTestGateway,
  ) {}

  private enabled() {
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !this.config.get('STRIPE_TEST_CHECKOUT_ENABLED', { infer: true }) ||
      this.config.get('NODE_ENV', { infer: true }) === 'production'
    )
      throw new ServiceUnavailableException(
        'Test-only card completion is disabled',
      )
  }

  async complete(customerId: string, orderId: string) {
    this.enabled()
    const order = await this.db.client.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    const claim = await this.db.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
        const locked = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        })
        const attempt = await tx.paymentAttempt.findUnique({
          where: { orderId },
        })
        if (
          !attempt ||
          !attempt.providerIntentId ||
          attempt.provider !== 'STRIPE_TEST'
        )
          throw new ConflictException('Prepare the Stripe TEST intent first')
        if (
          attempt.status === 'AWAITING_WEBHOOK' ||
          attempt.status === 'SETTLED'
        )
          return { attempt, alreadyDone: true }
        if (
          locked.status !== 'PENDING_PAYMENT' ||
          locked.paymentDeadlineAt <= new Date()
        )
          throw new ConflictException('Order payment window has closed')
        if (
          attempt.amountMinor !== locked.totalMinor ||
          attempt.currency !== locked.currency ||
          !SAFE_STATUSES.includes(
            attempt.status as (typeof SAFE_STATUSES)[number],
          )
        )
          throw new ConflictException(
            'Payment is not eligible for test completion',
          )
        if (attempt.testCompletionAttempts >= MAX_ATTEMPTS)
          throw new ConflictException('TEST payment requires manual review')
        if (
          attempt.status !== 'READY' &&
          attempt.testCompletionStartedAt &&
          attempt.testCompletionStartedAt > new Date(Date.now() - LEASE_MS)
        )
          throw new ConflictException('TEST payment completion is in progress')
        const updated = await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: attempt.status === 'READY' ? 'CONFIRMING' : attempt.status,
            testCompletionStartedAt: new Date(),
            testCompletionAttempts: { increment: 1 },
          },
        })
        return { attempt: updated, alreadyDone: false }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    )
    if (claim.alreadyDone) return this.output(orderId, claim.attempt.status)
    const attempt = claim.attempt
    const intentId = attempt.providerIntentId!
    try {
      let provider = await this.gateway.retrieve(intentId)
      this.verify(provider, attempt, orderId)
      if (
        provider.status === 'requires_payment_method' ||
        provider.status === 'requires_confirmation'
      ) {
        if (attempt.status === 'CAPTURING')
          return this.review(attempt.id, orderId)
        provider = await this.gateway.confirmTestCard(intentId, orderId)
        this.verify(provider, attempt, orderId)
      }
      if (provider.status === 'requires_capture') {
        await this.db.client.paymentAttempt.updateMany({
          where: { id: attempt.id, status: 'CONFIRMING' },
          data: { status: 'CAPTURING' },
        })
        provider = await this.gateway.captureTest(intentId, orderId)
        this.verify(provider, attempt, orderId)
      }
      if (
        provider.status !== 'succeeded' ||
        provider.amountReceivedMinor !== attempt.amountMinor
      )
        return this.review(attempt.id, orderId)
      // Still no PAID/order/stock update. A signed webhook receipt plus fresh
      // provider retrieval by PaymentSettlementService is required for settlement.
      await this.db.client.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['CONFIRMING', 'CAPTURING'] } },
        data: { status: 'AWAITING_WEBHOOK', testCompletionStartedAt: null },
      })
      const current = await this.db.client.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      })
      return this.output(orderId, current.status)
    } catch (error) {
      // An HTTP timeout may mean Stripe already captured the test payment.
      // Keep the fenced attempt for a safe status-retrieval retry; never free stock.
      if (error instanceof ServiceUnavailableException) throw error
      throw new ServiceUnavailableException(
        'TEST payment needs status reconciliation',
      )
    }
  }

  private verify(
    provider: VerifiedStripeIntentState,
    attempt: {
      providerIntentId: string | null
      amountMinor: number
      currency: string
    },
    orderId: string,
  ) {
    if (
      provider.livemode !== false ||
      provider.id !== attempt.providerIntentId ||
      provider.orderId !== orderId ||
      provider.amountMinor !== attempt.amountMinor ||
      provider.currency !== attempt.currency
    )
      throw new ConflictException(
        'Stripe TEST identity mismatch; manual review required',
      )
  }

  private async review(attemptId: string, orderId: string) {
    await this.db.client.$transaction(async (tx) => {
      const current = await tx.paymentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      })
      if (!['CONFIRMING', 'CAPTURING'].includes(current.status)) return
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: { status: 'REQUIRES_REVIEW', testCompletionStartedAt: null },
      })
      await tx.outboxEvent.create({
        data: {
          eventType: 'payment.test_review_required',
          payload: {
            orderId,
            paymentAttemptId: attemptId,
            reason: 'TEST_CONFIRM_CAPTURE',
          },
        },
      })
    })
    // Does not close or release the order; operational reconciliation is required.
    return this.output(orderId, 'REQUIRES_REVIEW')
  }

  private output(orderId: string, status: string) {
    return {
      orderId,
      testMode: true as const,
      state: status,
      paid: status === 'SETTLED',
      settlementPending: status === 'AWAITING_WEBHOOK',
    }
  }
}
