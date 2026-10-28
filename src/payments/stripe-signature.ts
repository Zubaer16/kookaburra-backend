import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'

export type VerifiedStripeEvent = {
  eventId: string
  eventType: string
  providerIntentId: string | null
  payloadSha256: string
}

/** Stripe uses t=<unix seconds>,v1=<hex HMAC SHA-256>. NEVER sign parsed JSON. */
export function verifyStripeEvent(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedStripeEvent {
  if (!secret || !rawBody || rawBody.length === 0 || rawBody.length > 100_000)
    throw new BadRequestException(
      'Stripe webhook raw body is missing or invalid',
    )
  if (!signature || signature.length > 2048)
    throw new UnauthorizedException('Invalid webhook signature')
  const parts = signature.split(',').map((entry) => entry.trim().split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value)
  if (!timestamp || !/^\d{10,12}$/.test(timestamp) || signatures.length < 1)
    throw new UnauthorizedException('Invalid webhook signature')
  const seconds = Number(timestamp)
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > 300)
    throw new UnauthorizedException('Webhook timestamp outside allowed window')
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest()
  const matched = signatures.some((hex) => {
    if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return false
    const bytes = Buffer.from(hex, 'hex')
    return bytes.length === digest.length && timingSafeEqual(bytes, digest)
  })
  if (!matched) throw new UnauthorizedException('Invalid webhook signature')
  let body: unknown
  try {
    body = JSON.parse(rawBody.toString('utf8')) as unknown
  } catch {
    throw new BadRequestException('Malformed Stripe event')
  }
  if (typeof body !== 'object' || body === null)
    throw new BadRequestException('Malformed Stripe event')
  const event = body as Record<string, unknown>
  if (
    event.livemode !== false ||
    typeof event.id !== 'string' ||
    !/^evt_[A-Za-z0-9]{6,120}$/.test(event.id) ||
    typeof event.type !== 'string' ||
    !/^[a-z_]+(?:\.[a-z_]+){1,4}$/.test(event.type) ||
    event.type.length > 120 ||
    typeof event.data !== 'object' ||
    !event.data
  )
    throw new BadRequestException('Invalid or non-test Stripe event')
  const data = event.data as Record<string, unknown>
  const object =
    typeof data.object === 'object' && data.object
      ? (data.object as Record<string, unknown>)
      : null
  const providerIntentId =
    object?.object === 'payment_intent' &&
    typeof object.id === 'string' &&
    /^pi_[A-Za-z0-9]{6,120}$/.test(object.id)
      ? object.id
      : null
  return {
    eventId: event.id,
    eventType: event.type,
    providerIntentId,
    payloadSha256: createHash('sha256').update(rawBody).digest('hex'),
  }
}
