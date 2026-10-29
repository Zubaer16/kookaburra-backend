import { sortedTrackingEvents } from './tracking.service'

describe('04D-2B-2 tracking timeline', () => {
  it('sorts events deterministically without changing their historical statuses', () => {
    const now = new Date('2026-10-29T07:00:00.000Z')
    const earlier = new Date('2026-10-29T06:00:00.000Z')
    const result = sortedTrackingEvents([
      {
        id: 'c',
        referenceId: 'order',
        type: 'REPLACEMENT',
        status: 'SHIPPED',
        occurredAt: now,
      },
      {
        id: 'b',
        referenceId: 'order',
        type: 'SHIPMENT',
        status: 'DELIVERED',
        occurredAt: now,
      },
      {
        id: 'a',
        referenceId: 'order',
        type: 'ORDER',
        status: 'PAID',
        occurredAt: earlier,
      },
    ])
    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(result.map((x) => x.status)).toEqual([
      'PAID',
      'DELIVERED',
      'SHIPPED',
    ])
  })
})
