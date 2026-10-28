import { createHmac } from 'node:crypto'
import { verifyStripeEvent } from './stripe-signature'

const secret = 'whsec_TESTONLY12345678901234567890'
const event = {
  id: 'evt_TestOnly12345678', type: 'payment_intent.created', livemode: false,
  data: { object: { object: 'payment_intent', id: 'pi_TestOnly1234567890', status: 'requires_payment_method' } },
}
function signed(body: Buffer, timestamp: number) {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')}`
}
describe('Stripe signed raw-body test webhook gate', () => {
  const now = 1_800_000_000
  const raw = Buffer.from(JSON.stringify(event))
  it('accepts authentic TEST event and retains only safe metadata + hash', () => {
    const accepted = verifyStripeEvent(raw, signed(raw, now), secret, now)
    expect(accepted).toMatchObject({
      eventId: event.id, eventType: event.type, providerIntentId: event.data.object.id,
    })
    expect(accepted.payloadSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(accepted)).not.toContain('requires_payment_method')
  })
  it('rejects tampering, stale timestamps, live events and unsigned payloads', () => {
    expect(() => verifyStripeEvent(Buffer.from('{}'), signed(raw, now), secret, now)).toThrow()
    expect(() => verifyStripeEvent(raw, signed(raw, now - 301), secret, now)).toThrow()
    expect(() => verifyStripeEvent(raw, undefined, secret, now)).toThrow()
    expect(() => verifyStripeEvent(undefined, signed(raw, now), secret, now)).toThrow()
    const live = Buffer.from(JSON.stringify({ ...event, livemode: true }))
    expect(() => verifyStripeEvent(live, signed(live, now), secret, now)).toThrow()
  })
  it('requires the exact original body and supports signature rotation', () => {
    const header = `t=${now},v1=${'0'.repeat(64)},v1=${signed(raw, now).split('v1=')[1]}`
    expect(verifyStripeEvent(raw, header, secret, now).eventId).toBe(event.id)
    expect(() => verifyStripeEvent(Buffer.from(JSON.stringify(event, null, 2)), header, secret, now)).toThrow()
  })
})
