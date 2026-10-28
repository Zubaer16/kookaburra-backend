import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Environment } from '../config/environment'

export type PreparedStripeIntent = { id: string; status: string }

/** Small, fixed-endpoint provider boundary: no dynamic URLs, no browser secrets. */
@Injectable()
export class StripeTestGateway {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async prepare(input: {
    orderId: string
    amountMinor: number
    currency: string
    idempotencyKey: string
  }): Promise<PreparedStripeIntent> {
    const key = this.config.get('STRIPE_TEST_SECRET_KEY', { infer: true })
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !key.startsWith('sk_test_')
    )
      throw new ServiceUnavailableException(
        'Stripe test preparation is disabled',
      )
    // These two parameters deliberately block any client-side completion until
    // the 04C-2B capture/settlement/expiry-reconciliation state machine exists.
    const form = new URLSearchParams({
      amount: String(input.amountMinor),
      currency: input.currency.toLowerCase(),
      capture_method: 'manual',
      confirmation_method: 'manual',
      'payment_method_types[]': 'card',
      'metadata[order_id]': input.orderId,
      'metadata[implementation_phase]': '04C-2A',
    })
    let response: Response
    try {
      response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: form.toString(),
        signal: AbortSignal.timeout(12_000),
      })
    } catch {
      throw new ServiceUnavailableException(
        'Stripe test API temporarily unavailable',
      )
    }
    // Never log or include provider bodies: they can contain client_secret.
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Stripe test intent preparation was rejected; operator review may be needed',
      )
    let obj: unknown
    try {
      obj = (await response.json()) as unknown
    } catch {
      throw new ServiceUnavailableException('Invalid Stripe test API response')
    }
    const intent = obj as Record<string, unknown> | null
    if (
      !intent ||
      typeof intent.id !== 'string' ||
      !/^pi_[A-Za-z0-9]{6,120}$/.test(intent.id) ||
      intent.livemode !== false ||
      intent.amount !== input.amountMinor ||
      intent.currency !== input.currency.toLowerCase() ||
      intent.capture_method !== 'manual' ||
      intent.confirmation_method !== 'manual' ||
      typeof intent.status !== 'string'
    )
      throw new ServiceUnavailableException(
        'Stripe test response failed invariant validation',
      )
    return { id: intent.id, status: intent.status }
  }
  /** TEST-only refund with a stable per-ledger-entry idempotency key. */
  async createRefund(input: {
    refundRequestId: string
    orderId: string
    paymentIntentId: string
    amountMinor: number
    currency: string
    reason: string
    idempotencyKey: string
  }): Promise<VerifiedStripeRefund> {
    const key = this.refundKey()
    if (
      !/^pi_[A-Za-z0-9]{6,120}$/.test(input.paymentIntentId) ||
      !/^[0-9a-f-]{36}$/i.test(input.refundRequestId) ||
      !/^[0-9a-f-]{36}$/i.test(input.orderId) ||
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor < 1 ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !/^kb-test-refund-[0-9a-f-]{36}$/i.test(input.idempotencyKey)
    )
      throw new ServiceUnavailableException('Invalid TEST refund request')
    const reason = (
      {
        CUSTOMER_REQUEST: 'requested_by_customer',
        DUPLICATE: 'duplicate',
        FRAUDULENT: 'fraudulent',
      } as Record<string, string>
    )[input.reason]
    const form = new URLSearchParams({
      payment_intent: input.paymentIntentId,
      amount: String(input.amountMinor),
      'metadata[order_id]': input.orderId,
      'metadata[refund_request_id]': input.refundRequestId,
    })
    if (reason) form.set('reason', reason)
    const response = await this.refundFetch(
      'https://api.stripe.com/v1/refunds',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: form.toString(),
        signal: AbortSignal.timeout(12_000),
      },
    )
    const refund = this.validateRefund(response)
    if (refund.currency !== input.currency)
      throw new ServiceUnavailableException(
        'Stripe TEST refund currency mismatch',
      )
    return refund
  }

  /** A fresh provider read is always required before recording final status. */
  async retrieveRefund(refundId: string): Promise<VerifiedStripeRefund> {
    const key = this.refundKey()
    if (!/^re_[A-Za-z0-9]{6,120}$/.test(refundId))
      throw new ServiceUnavailableException('Invalid TEST refund identity')
    const result = await this.refundFetch(
      `https://api.stripe.com/v1/refunds/${refundId}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(12_000),
      },
    )
    const refund = this.validateRefund(result)
    if (refund.id !== refundId)
      throw new ServiceUnavailableException('Stripe TEST refund ID mismatch')
    return refund
  }

  private refundKey(): string {
    const key = this.config.get('STRIPE_TEST_SECRET_KEY', { infer: true })
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'production' ||
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !this.config.get('STRIPE_TEST_REFUNDS_ENABLED', { infer: true }) ||
      !/^sk_test_[A-Za-z0-9]{8,}$/.test(key)
    )
      throw new ServiceUnavailableException('Stripe TEST refunds are disabled')
    return key
  }

  private async refundFetch(
    url: string,
    options: RequestInit,
  ): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, options)
    } catch {
      throw new ServiceUnavailableException(
        'Stripe TEST refund API unavailable',
      )
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Stripe TEST refund needs provider reconciliation',
      )
    try {
      return (await response.json()) as unknown
    } catch {
      throw new ServiceUnavailableException(
        'Invalid Stripe TEST refund response',
      )
    }
  }

  private validateRefund(value: unknown): VerifiedStripeRefund {
    const obj = value as Record<string, unknown> | null
    const metadata =
      obj && typeof obj.metadata === 'object' && obj.metadata !== null
        ? (obj.metadata as Record<string, unknown>)
        : null
    if (
      !obj ||
      obj.object !== 'refund' ||
      typeof obj.id !== 'string' ||
      !/^re_[A-Za-z0-9]{6,120}$/.test(obj.id) ||
      // Stripe's Refund object does not consistently include livemode.
      // Enforce TEST credentials in refundKey(), and reject explicit live flags.
      obj.livemode === true ||
      !Number.isSafeInteger(obj.amount) ||
      (obj.amount as number) < 1 ||
      typeof obj.currency !== 'string' ||
      !/^[a-z]{3}$/.test(obj.currency) ||
      typeof obj.payment_intent !== 'string' ||
      !/^pi_[A-Za-z0-9]{6,120}$/.test(obj.payment_intent) ||
      typeof obj.status !== 'string' ||
      typeof metadata?.order_id !== 'string' ||
      typeof metadata?.refund_request_id !== 'string'
    )
      throw new ServiceUnavailableException(
        'Stripe TEST refund failed invariant verification',
      )
    return {
      id: obj.id,
      status: obj.status,
      amountMinor: obj.amount as number,
      currency: (obj.currency as string).toUpperCase(),
      paymentIntentId: obj.payment_intent,
      orderId: metadata.order_id,
      refundRequestId: metadata.refund_request_id,
      livemode: false,
    }
  }

  /** Cancel a closed order's unused TEST PaymentIntent. This never refunds a paid charge. */
  async cancel(
    intentId: string,
    reason: 'abandoned' | 'requested_by_customer' = 'abandoned',
  ): Promise<VerifiedStripeIntentState> {
    const key = this.config.get('STRIPE_TEST_SECRET_KEY', { infer: true })
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !/^sk_test_[A-Za-z0-9]{8,}$/.test(key)
    )
      throw new ServiceUnavailableException(
        'Stripe TEST cancellation is disabled',
      )
    if (!/^pi_[A-Za-z0-9]{6,120}$/.test(intentId))
      throw new ServiceUnavailableException('Invalid Stripe TEST intent ID')
    let response: Response
    try {
      response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${intentId}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ cancellation_reason: reason }).toString(),
          signal: AbortSignal.timeout(12_000),
        },
      )
    } catch {
      throw new ServiceUnavailableException(
        'Stripe TEST cancellation temporarily unavailable',
      )
    }
    // A failed Stripe cancellation can mean the intent is already canceled or paid;
    // never guess which. The worker performs a fresh read and quarantines success.
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Stripe TEST cancellation requires status verification',
      )
    let result: unknown
    try {
      result = (await response.json()) as unknown
    } catch {
      throw new ServiceUnavailableException(
        'Invalid Stripe TEST cancellation response',
      )
    }
    return this.validateIntent(intentId, result)
  }

  /** Only the fixed Stripe TEST PaymentMethod. Never accepts card data or IDs from clients. */
  async confirmTestCard(
    intentId: string,
    orderId: string,
  ): Promise<VerifiedStripeIntentState> {
    return this.postIntentAction(
      intentId,
      'confirm',
      new URLSearchParams({
        payment_method: 'pm_card_visa',
        error_on_requires_action: 'true',
      }),
      `kb-test-confirm-${orderId}`,
    )
  }

  async captureTest(
    intentId: string,
    orderId: string,
  ): Promise<VerifiedStripeIntentState> {
    return this.postIntentAction(
      intentId,
      'capture',
      new URLSearchParams(),
      `kb-test-capture-${orderId}`,
    )
  }

  private async postIntentAction(
    intentId: string,
    action: 'confirm' | 'capture',
    form: URLSearchParams,
    idempotencyKey: string,
  ): Promise<VerifiedStripeIntentState> {
    const key = this.config.get('STRIPE_TEST_SECRET_KEY', { infer: true })
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !/^sk_test_[A-Za-z0-9]{8,}$/.test(key) ||
      !/^pi_[A-Za-z0-9]{6,120}$/.test(intentId)
    )
      throw new ServiceUnavailableException(
        'Stripe TEST action disabled or invalid',
      )
    let response: Response
    try {
      response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${intentId}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': idempotencyKey,
          },
          body: form.toString(),
          signal: AbortSignal.timeout(12_000),
        },
      )
    } catch {
      throw new ServiceUnavailableException('Stripe TEST action unavailable')
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Stripe TEST action rejected; status verification required',
      )
    let json: unknown
    try {
      json = (await response.json()) as unknown
    } catch {
      throw new ServiceUnavailableException(
        'Invalid Stripe TEST action response',
      )
    }
    return this.validateIntent(intentId, json)
  }

  private validateIntent(
    intentId: string,
    json: unknown,
  ): VerifiedStripeIntentState {
    const value = json as Record<string, unknown> | null
    const metadata =
      value && typeof value.metadata === 'object' && value.metadata !== null
        ? (value.metadata as Record<string, unknown>)
        : null
    if (
      !value ||
      value.id !== intentId ||
      value.object !== 'payment_intent' ||
      value.livemode !== false ||
      typeof value.status !== 'string' ||
      !Number.isSafeInteger(value.amount) ||
      !Number.isSafeInteger(value.amount_received) ||
      typeof value.currency !== 'string' ||
      !/^[a-z]{3}$/.test(value.currency) ||
      typeof metadata?.order_id !== 'string'
    )
      throw new ServiceUnavailableException(
        'Stripe TEST intent failed invariant verification',
      )
    return {
      id: intentId,
      status: value.status,
      amountMinor: value.amount as number,
      amountReceivedMinor: value.amount_received as number,
      currency: (value.currency as string).toUpperCase(),
      orderId: metadata.order_id,
      livemode: false,
    }
  }

  /** Always refetch directly from Stripe before financial state can change. */
  async retrieve(intentId: string): Promise<VerifiedStripeIntentState> {
    const key = this.config.get('STRIPE_TEST_SECRET_KEY', { infer: true })
    if (
      !this.config.get('STRIPE_TEST_ENABLED', { infer: true }) ||
      !/^sk_test_[A-Za-z0-9]{8,}$/.test(key)
    )
      throw new ServiceUnavailableException(
        'Stripe test reconciliation is disabled',
      )
    if (!/^pi_[A-Za-z0-9]{6,120}$/.test(intentId))
      throw new ServiceUnavailableException(
        'Invalid Stripe test intent identity',
      )
    let response: Response
    try {
      response = await fetch(
        `https://api.stripe.com/v1/payment_intents/${intentId}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(12_000),
        },
      )
    } catch {
      throw new ServiceUnavailableException(
        'Stripe test status lookup unavailable',
      )
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Stripe test status lookup rejected',
      )
    let json: unknown
    try {
      json = (await response.json()) as unknown
    } catch {
      throw new ServiceUnavailableException(
        'Invalid Stripe test status response',
      )
    }
    return this.validateIntent(intentId, json)
  }
}

export type VerifiedStripeIntentState = {
  id: string
  status: string
  amountMinor: number
  amountReceivedMinor: number
  currency: string
  orderId: string | null
  livemode: false
}

export type VerifiedStripeRefund = {
  id: string
  status: string
  amountMinor: number
  currency: string
  paymentIntentId: string
  orderId: string
  refundRequestId: string
  livemode: false
}
