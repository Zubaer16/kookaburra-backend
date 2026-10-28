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
}
