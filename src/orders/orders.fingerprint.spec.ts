import { randomUUID } from 'node:crypto'
import { orderRequestFingerprint } from './orders.service'
import { CreateOrderDto } from './orders.dto'

describe('04C-1 order idempotency fingerprint', () => {
  const payload: CreateOrderDto = {
    requestId: randomUUID(),
    reservationId: randomUUID(),
    shippingAddress: {
      recipientName: 'Alex',
      phone: '+12025550123',
      addressLine1: '1 Road',
      city: 'Dhaka',
      countryCode: 'BD',
    },
  }
  it('normalizes optional address fields, is stable for replay, and does not depend on the request id', () => {
    expect(orderRequestFingerprint(payload)).toHaveLength(64)
    expect(orderRequestFingerprint(payload)).toBe(
      orderRequestFingerprint({
        ...payload,
        requestId: randomUUID(),
        shippingAddress: { ...payload.shippingAddress, region: ' ' },
      }),
    )
  })
  it('rejects a changed reservation, recipient, address or country as an idempotent match', () => {
    const hash = orderRequestFingerprint(payload)
    expect(
      orderRequestFingerprint({ ...payload, reservationId: randomUUID() }),
    ).not.toBe(hash)
    expect(
      orderRequestFingerprint({
        ...payload,
        shippingAddress: { ...payload.shippingAddress, city: 'Sylhet' },
      }),
    ).not.toBe(hash)
  })
})
