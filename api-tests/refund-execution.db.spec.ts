import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../src/database/database.service'
import { Environment } from '../src/config/environment'
import { RefundExecutionService } from '../src/payments/refund-execution.service'
import {
  StripeTestGateway,
  VerifiedStripeRefund,
} from '../src/payments/stripe-gateway'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('04C-2B2C2 real DB: verified Stripe TEST refund, replay, failed refund ceiling, mismatch review, no restock', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const countryCode = 'CK',
    currency = 'USD'
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const cat = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Refund Execution', slug: f.slug('refund-exec-cat') },
    })
    expect(cat.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Refund Execution Product',
        slug: f.slug('refund-exec-prod'),
        sku: f.sku('refund-exec'),
        priceMinor: 400,
        currency,
        status: 'ACTIVE',
        stockOnHand: 4,
        categoryIds: [(await cat.json()).id],
      },
    })
    expect(product.status()).toBe(201)
    const productId = (await product.json()).id as string
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 20,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 20,
        taxBps: 0,
        enabled: true,
        freeOverSubtotalMinor: null,
      },
    })
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(customer.token),
          data: { productId, quantity: 2 },
        })
      ).status(),
    ).toBe(200)
    const hold = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { requestId: randomUUID(), countryCode },
    })
    expect(hold.status()).toBe(200)
    const orderResponse = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await hold.json()).id,
        shippingAddress: {
          recipientName: 'Refund QA',
          phone: '+12025550123',
          addressLine1: '9 Example Road',
          city: 'Example',
          countryCode,
        },
      },
    })
    expect(orderResponse.status()).toBe(200)
    const order = (await orderResponse.json()) as {
      id: string
      totalMinor: number
    }
    const intentId = `pi_RefundExec${f.key}123456`
    const attempt = await f.db.paymentAttempt.create({
      data: {
        orderId: order.id,
        providerIntentId: intentId,
        idempotencyKey: `refund-exec-${f.key}`,
        status: 'SETTLED',
        amountMinor: order.totalMinor,
        currency,
      },
    })
    const transaction = await f.db.paymentTransaction.create({
      data: {
        orderId: order.id,
        paymentAttemptId: attempt.id,
        providerIntentId: intentId,
        amountMinor: order.totalMinor,
        currency,
      },
    })
    await f.db.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    })
    const balanceBefore = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    const makeRow = (amountMinor: number) =>
      f.db.refundRequest.create({
        data: {
          orderId: order.id,
          paymentTransactionId: transaction.id,
          requestId: randomUUID(),
          amountMinor,
          currency,
          reason: 'OTHER',
          requestedById: owner.id,
        },
      })
    const first = await makeRow(100)
    const second = await makeRow(101)
    const third = await makeRow(102)
    let createCalls = 0
    const createdIds = new Map<string, string>()
    const fake = {
      createRefund: async (input: {
        refundRequestId: string
        orderId: string
        amountMinor: number
        currency: string
        paymentIntentId: string
        idempotencyKey: string
      }) => {
        createCalls++
        expect(input.idempotencyKey).toBe(
          `kb-test-refund-${input.refundRequestId}`,
        )
        const id = `re_RefundExec${createCalls}123456789`
        createdIds.set(input.refundRequestId, id)
        return {
          id,
          status: 'pending',
          amountMinor: input.amountMinor,
          currency: input.currency,
          paymentIntentId: input.paymentIntentId,
          orderId: input.orderId,
          refundRequestId: input.refundRequestId,
          livemode: false,
        } as VerifiedStripeRefund
      },
      retrieveRefund: async (id: string) => {
        const row = await f.db.refundRequest.findFirstOrThrow({
          where: { providerRefundId: id },
        })
        const status =
          row.id === first.id
            ? 'succeeded'
            : row.id === second.id
              ? 'failed'
              : 'pending'
        return {
          id,
          status,
          amountMinor:
            row.id === third.id ? row.amountMinor + 1 : row.amountMinor,
          currency,
          paymentIntentId: intentId,
          orderId: order.id,
          refundRequestId: row.id,
          livemode: false,
        } as VerifiedStripeRefund
      },
    }
    const config = {
      get: (key: string) => (key === 'NODE_ENV' ? 'test' : true),
    }
    const service = new RefundExecutionService(
      { client: f.db } as unknown as DatabaseService,
      config as unknown as ConfigService<Environment, true>,
      fake as unknown as StripeTestGateway,
    )
    const [one, duplicate] = await Promise.all([
      service.process(first.id),
      service.process(first.id),
    ])
    expect([one, duplicate].sort()).toEqual(['SKIPPED', 'SUCCEEDED'])
    expect(createCalls).toBe(1)
    expect(await service.process(first.id)).toBe('SKIPPED')
    expect(
      (await f.db.refundRequest.findUniqueOrThrow({ where: { id: first.id } }))
        .status,
    ).toBe('SUCCEEDED')
    expect(await service.process(second.id)).toBe('FAILED')
    expect(
      (await f.db.refundRequest.findUniqueOrThrow({ where: { id: second.id } }))
        .status,
    ).toBe('FAILED')
    expect(await service.process(third.id)).toBe('REVIEW')
    expect(
      (await f.db.refundRequest.findUniqueOrThrow({ where: { id: third.id } }))
        .status,
    ).toBe('REQUIRES_REVIEW')
    const balanceAfter = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    expect(balanceAfter.onHand).toBe(balanceBefore.onHand)
    expect(balanceAfter.reservedQuantity).toBe(balanceBefore.reservedQuantity)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PAID')
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balanceBefore.id, reason: 'SALE' },
      }),
    ).toBe(0)
    expect(createdIds.size).toBe(3)
  } finally {
    if (prior)
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: prior.shippingMinor,
          taxBps: prior.taxBps,
          freeOverSubtotalMinor: prior.freeOverSubtotalMinor,
          enabled: prior.enabled,
        },
      })
    else
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.close()
  }
})
