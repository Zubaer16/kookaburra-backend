import { ConflictException, NotFoundException } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { DatabaseService } from '../database/database.service'

const order = {
  id: 'a00e89f5-271a-4425-9847-7a72ee848e99',
  reservationId: 'e0084ee4-929c-4746-9333-975eaefc51f0',
  requestId: '6e4a1c3e-3f5e-46f1-b0b8-9070e67f5657',
  status: 'PAID',
  countryCode: 'US',
  currency: 'USD',
  subtotalMinor: 100,
  shippingMinor: 0,
  taxMinor: 0,
  totalMinor: 100,
  shippingAddress: {},
  paymentDeadlineAt: new Date(),
  paidAt: new Date(),
  shipment: null,
  createdAt: new Date(),
  lines: [],
}

describe('G1-3 Admin unpaid-order cancellation safety', () => {
  it('rejects a paid order before any inventory, audit or order mutation', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: order.id }]),
      order: { findUniqueOrThrow: jest.fn().mockResolvedValue(order) },
      inventoryBalance: { update: jest.fn() },
      auditEvent: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
    }
    const service = new OrdersService({
      client: {
        $transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
      },
    } as unknown as DatabaseService)
    await expect(
      service.adminCancel(order.id, 'actor-id'),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.inventoryBalance.update).not.toHaveBeenCalled()
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
    expect(tx.outboxEvent.create).not.toHaveBeenCalled()
  })

  it('does not write a duplicate audit or release for an already closed order', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: order.id }]),
      order: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, status: 'CANCELLED', paidAt: null }),
      },
      checkoutReservationLine: { findMany: jest.fn() },
      auditEvent: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
    }
    const service = new OrdersService({
      client: {
        $transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
      },
    } as unknown as DatabaseService)
    const response = await service.adminCancel(order.id, 'actor-id')
    expect(response.status).toBe('CANCELLED')
    expect(tx.checkoutReservationLine.findMany).not.toHaveBeenCalled()
    expect(tx.auditEvent.create).not.toHaveBeenCalled()
    expect(tx.outboxEvent.create).not.toHaveBeenCalled()
  })

  it('returns 404 without attempting an order read when the id does not exist', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: { findUniqueOrThrow: jest.fn() },
    }
    const service = new OrdersService({
      client: {
        $transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
      },
    } as unknown as DatabaseService)
    await expect(
      service.adminCancel(order.id, 'actor-id'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.order.findUniqueOrThrow).not.toHaveBeenCalled()
  })
})
