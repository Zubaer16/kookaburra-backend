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
import { StripeTestGateway } from './stripe-gateway'
import { verifyStripeEvent } from './stripe-signature'

const RETRY_LEASE_MS = 45_000
// Stripe keys are ordinarily retained 24h. Fail closed earlier rather than
// risk a second intent after a lost response & provider key expiry.
const MAX_RETRY_AGE_MS = 22 * 60 * 60 * 1000

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly stripe: StripeTestGateway,
  ) {}

  private enabled() {
    if (!this.config.get('STRIPE_TEST_ENABLED', { infer: true }))
      throw new ServiceUnavailableException(
        'Stripe test preparation is disabled',
      )
  }

  private display(entry: {
    orderId: string
    providerIntentId: string | null
    status: string
    amountMinor: number
    currency: string
  }) {
    return {
      orderId: entry.orderId,
      provider: 'STRIPE_TEST',
      providerIntentId: entry.providerIntentId,
      preparationStatus: entry.status,
      amountMinor: entry.amountMinor,
      currency: entry.currency,
      canConfirm: false as const,
      payable: false as const,
    }
  }

  async get(customerId: string, orderId: string) {
    const order = await this.db.client.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    const entry = await this.db.client.paymentAttempt.findUnique({
      where: { orderId },
    })
    return entry ? this.display(entry) : null
  }

  async prepare(customerId: string, orderId: string) {
    this.enabled()
    const order = await this.db.client.order.findFirst({
      where: { id: orderId, customerId },
    })
    if (!order) throw new NotFoundException('Order not found')
    if (
      order.status !== 'PENDING_PAYMENT' ||
      order.paymentDeadlineAt <= new Date()
    )
      throw new ConflictException(
        'Order is not within its payment preparation window',
      )
    if (order.totalMinor <= 0 || !Number.isSafeInteger(order.totalMinor))
      throw new ConflictException('Order amount cannot be prepared for Stripe')

    const key = `kb04c2a-order-${order.id}`
    let canCallProvider = false
    let attempt = await this.db.client.paymentAttempt.findUnique({
      where: { orderId },
    })
    if (!attempt) {
      try {
        attempt = await this.db.client.paymentAttempt.create({
          data: {
            orderId,
            idempotencyKey: key,
            amountMinor: order.totalMinor,
            currency: order.currency,
          },
        })
        canCallProvider = true
      } catch (error) {
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          )
        )
          throw error
        attempt = await this.db.client.paymentAttempt.findUniqueOrThrow({
          where: { orderId },
        })
      }
    }
    if (
      attempt.idempotencyKey !== key ||
      attempt.amountMinor !== order.totalMinor ||
      attempt.currency !== order.currency
    )
      throw new ConflictException(
        'Payment preparation immutable values changed',
      )
    if (attempt.status === 'READY') return this.display(attempt)
    if (
      [
        'SETTLED',
        'CANCELLING',
        'CANCELLED',
        'CONFIRMING',
        'CAPTURING',
        'AWAITING_WEBHOOK',
      ].includes(attempt.status)
    )
      throw new ConflictException(
        'Payment attempt is not eligible for preparation',
      )
    if (attempt.status === 'REQUIRES_REVIEW')
      throw new ConflictException(
        'Payment preparation requires manual reconciliation',
      )
    if (!canCallProvider) {
      if (Date.now() - attempt.createdAt.getTime() > MAX_RETRY_AGE_MS)
        throw new ConflictException(
          'Payment preparation too old; manual Stripe reconciliation required',
        )
      const claim = await this.db.client.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: 'CREATING',
          creationStartedAt: { lt: new Date(Date.now() - RETRY_LEASE_MS) },
        },
        data: { creationStartedAt: new Date() },
      })
      if (claim.count !== 1)
        throw new ConflictException(
          'Payment preparation is in progress; retry later',
        )
    }
    // NO DB transaction around outbound network calls. Stripe idempotency key
    // is stable per order for safe recovery if the API reply is lost.
    const intent = await this.stripe.prepare({
      orderId,
      idempotencyKey: key,
      amountMinor: order.totalMinor,
      currency: order.currency,
    })
    const settled = await this.db.client.$transaction(async (tx) => {
      // Lock order first; cancellation/expiry uses the same lock order.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
      const latest = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      })
      const saved = await tx.paymentAttempt.update({
        where: { orderId },
        data: {
          providerIntentId: intent.id,
          status:
            latest.status === 'PENDING_PAYMENT' &&
            latest.paymentDeadlineAt > new Date()
              ? 'READY'
              : 'REQUIRES_REVIEW',
        },
      })
      if (saved.status === 'READY')
        await tx.outboxEvent.create({
          data: {
            eventType: 'payment.test_intent_prepared',
            payload: { orderId, providerIntentId: intent.id },
          },
        })
      return saved
    })
    if (settled.status !== 'READY')
      throw new ConflictException(
        'Order expired while preparing payment; Stripe intent requires reconciliation',
      )
    return this.display(settled)
  }

  async receiveWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ) {
    this.enabled()
    const secret = this.config.get('STRIPE_TEST_WEBHOOK_SECRET', {
      infer: true,
    })
    const event = verifyStripeEvent(rawBody, signature, secret)
    try {
      await this.db.client.paymentWebhookReceipt.create({
        data: eventMapping(event),
      })
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      )
        throw error
      const previous = await this.db.client.paymentWebhookReceipt.findUnique({
        where: { providerEventId: event.eventId },
      })
      if (!previous || previous.payloadSha256 !== event.payloadSha256)
        throw new ConflictException(
          'Stripe event ID reused with different payload',
        )
    }
    // This is event RECEIPT, not event PROCESSING or order settlement.
    return { received: true }
  }
}

function eventMapping(event: ReturnType<typeof verifyStripeEvent>) {
  return {
    providerEventId: event.eventId,
    eventType: event.eventType,
    providerIntentId: event.providerIntentId,
    payloadSha256: event.payloadSha256,
  }
}
