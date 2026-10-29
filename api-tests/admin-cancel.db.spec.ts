import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const countryCode = 'XC'
const currency = 'USD'

/** Uses isolated guarded local test DB. Payment gateway is never called. */
test('04D-2B-3 real DB: fenced Admin unpaid cancellation, exactly-once release/audit and paid-order refusal', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const previous = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Admin Cancellation QA', slug: f.slug('cancel-cat') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Admin Cancellation QA SKU',
        slug: f.slug('cancel-product'),
        sku: f.sku('cancel'),
        priceMinor: 800,
        currency,
        status: 'ACTIVE',
        stockOnHand: 8,
        categoryIds: [(await category.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 0,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 0,
        taxBps: 0,
        freeOverSubtotalMinor: null,
        enabled: true,
      },
    })
    const createOrder = async () => {
      expect(
        (
          await request.put('/v1/cart/items', {
            headers: bearer(customer.token),
            data: { productId, quantity: 2 },
          })
        ).status(),
      ).toBe(200)
      const reserve = await request.post('/v1/checkout/reservations', {
        headers: bearer(customer.token),
        data: { requestId: randomUUID(), countryCode },
      })
      expect(reserve.status()).toBe(200)
      const placed = await request.post('/v1/orders', {
        headers: bearer(customer.token),
        data: {
          requestId: randomUUID(),
          reservationId: (await reserve.json()).id,
          shippingAddress: {
            recipientName: 'Order QA',
            phone: '+12025550123',
            addressLine1: '1 QA Street',
            city: 'QA City',
            countryCode,
          },
        },
      })
      expect(placed.status()).toBe(200)
      return (await placed.json()) as { id: string; totalMinor: number }
    }

    const pending = await createOrder()
    const url = `/v1/admin/orders/${pending.id}/cancel`
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
    // A potentially-successful provider capture must fence stock release.
    const attempt = await f.db.paymentAttempt.create({
      data: {
        orderId: pending.id,
        providerIntentId: `pi_cancel_${f.key}`,
        idempotencyKey: `cancel-${f.key}`,
        status: 'CAPTURING',
        amountMinor: pending.totalMinor,
        currency,
      },
    })
    expect(
      (await request.post(url, { headers: bearer(owner.token) })).status(),
    ).toBe(409)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: pending.id } }))
        .status,
    ).toBe('PENDING_PAYMENT')
    // Fixture-only: provider cancellation/reconciliation outcome simulated locally.
    await f.db.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'READY' },
    })
    const cancel = () => request.post(url, { headers: bearer(owner.token) })
    const [first, retry] = await Promise.all([cancel(), cancel()])
    expect([first.status(), retry.status()]).toEqual([200, 200])
    expect((await first.json()).status).toBe('CANCELLED')
    expect((await retry.json()).status).toBe('CANCELLED')
    expect((await cancel()).status()).toBe(200)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(8)
    expect(
      await f.db.inventoryMovement.count({ where: { balanceId: balance.id } }),
    ).toBe(1)
    expect(
      await f.db.orderStatusEvent.count({
        where: { orderId: pending.id, reason: 'ADMIN_CANCELLED' },
      }),
    ).toBe(1)
    expect(
      await f.db.auditEvent.count({
        where: {
          actorId: owner.id,
          action: 'order.cancel.admin',
          targetId: pending.id,
        },
      }),
    ).toBe(1)
    expect(
      await f.db.outboxEvent.count({
        where: {
          eventType: 'order.cancelled',
          payload: { path: ['orderId'], equals: pending.id },
        },
      }),
    ).toBe(1)
    expect(
      await f.db.refundRequest.count({ where: { orderId: pending.id } }),
    ).toBe(0)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: pending.id } }))
        .paidAt,
    ).toBeNull()

    // PAID order may not be cancelled via unpaid-order action, regardless of role.
    const paid = await createOrder()
    const settledAttempt = await f.db.paymentAttempt.create({
      data: {
        orderId: paid.id,
        providerIntentId: `pi_paid_cancel_${f.key}`,
        idempotencyKey: `paid-cancel-${f.key}`,
        status: 'SETTLED',
        amountMinor: paid.totalMinor,
        currency,
      },
    })
    await f.db.paymentTransaction.create({
      data: {
        orderId: paid.id,
        paymentAttemptId: settledAttempt.id,
        providerIntentId: `pi_paid_cancel_${f.key}`,
        amountMinor: paid.totalMinor,
        currency,
      },
    })
    await f.db.order.update({
      where: { id: paid.id },
      data: { status: 'PAID', paidAt: new Date() },
    })
    expect(
      (
        await request.post(`/v1/admin/orders/${paid.id}/cancel`, {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(409)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: paid.id } })).status,
    ).toBe('PAID')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
    expect(
      await f.db.auditEvent.count({
        where: { action: 'order.cancel.admin', targetId: paid.id },
      }),
    ).toBe(0)

    // Admin action on an overdue still-pending allocation records EXPIRED, not
    // misleading ADMIN_CANCELLED. Repeated calls must never release twice.
    const overdue = await createOrder()
    await f.db.order.update({
      where: { id: overdue.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 30_000) },
    })
    const expiredUrl = `/v1/admin/orders/${overdue.id}/cancel`
    const expired = await request.post(expiredUrl, {
      headers: bearer(owner.token),
    })
    expect(expired.status()).toBe(200)
    expect((await expired.json()).status).toBe('EXPIRED')
    expect(
      (
        await request.post(expiredUrl, { headers: bearer(owner.token) })
      ).status(),
    ).toBe(200)
    expect(
      await f.db.orderStatusEvent.count({
        where: {
          orderId: overdue.id,
          reason: 'PAYMENT_WINDOW_ELAPSED',
        },
      }),
    ).toBe(1)
    expect(
      await f.db.auditEvent.count({
        where: {
          action: 'order.expire.admin',
          targetId: overdue.id,
        },
      }),
    ).toBe(1)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
  } finally {
    if (previous)
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: previous.shippingMinor,
          freeOverSubtotalMinor: previous.freeOverSubtotalMinor,
          taxBps: previous.taxBps,
          enabled: previous.enabled,
        },
      })
    else
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.close()
  }
})
