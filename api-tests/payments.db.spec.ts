import { createHmac, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ConfigService } from '@nestjs/config'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { DatabaseService } from '../src/database/database.service'
import { Environment } from '../src/config/environment'
import { PaymentsService } from '../src/payments/payments.service'
import { StripeTestGateway } from '../src/payments/stripe-gateway'

const countryCode = 'CK'
const currency = 'USD'
const secret = 'whsec_TESTONLY12345678901234567890'
const address = {
  recipientName: 'Test Customer',
  phone: '+12025550123',
  addressLine1: '5 Payment Test Road',
  city: 'Exampletown',
  countryCode,
}

test('04C-2A real DB: one prepared test intent, safe replay, duplicate signed receipt, no stock or order change', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const eventId = `evt_TestPay${f.key}12345678`
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const other = await f.account('CUSTOMER')
    const category = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Payment Test', slug: f.slug('payment-category') },
    })
    expect(category.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Payment Test Shirt',
        slug: f.slug('payment-p'),
        sku: f.sku('payment'),
        priceMinor: 500,
        currency,
        status: 'ACTIVE',
        stockOnHand: 3,
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
        shippingMinor: 50,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 50,
        taxBps: 0,
        freeOverSubtotalMinor: null,
        enabled: true,
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
    const reserve = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { countryCode, requestId: randomUUID() },
    })
    expect(reserve.status()).toBe(200)
    const orderResp = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await reserve.json()).id,
        shippingAddress: address,
      },
    })
    expect(orderResp.status()).toBe(200)
    const order = (await orderResp.json()) as { id: string; totalMinor: number }

    const config = {
      get: (name: string) =>
        ({
          STRIPE_TEST_ENABLED: true,
          STRIPE_TEST_WEBHOOK_SECRET: secret,
        })[name],
    } as unknown as ConfigService<Environment, true>
    let providerCalls = 0
    const gateway = {
      prepare: async ({ amountMinor }: { amountMinor: number }) => {
        expect(amountMinor).toBe(order.totalMinor)
        providerCalls += 1
        return {
          id: `pi_TestPayment${f.key}987654321`,
          status: 'requires_payment_method',
        }
      },
    } as unknown as StripeTestGateway
    const payments = new PaymentsService(
      { client: f.db } as unknown as DatabaseService,
      config,
      gateway,
    )
    const first = await payments.prepare(customer.id, order.id)
    expect(first).toMatchObject({
      orderId: order.id,
      amountMinor: order.totalMinor,
      preparationStatus: 'READY',
      payable: false,
      canConfirm: false,
    })
    expect(first).not.toHaveProperty('clientSecret')
    const again = await payments.prepare(customer.id, order.id)
    expect(again).toEqual(first)
    expect(providerCalls).toBe(1)
    await expect(payments.get(other.id, order.id)).rejects.toThrow(
      'Order not found',
    )
    expect(
      await f.db.paymentAttempt.count({ where: { orderId: order.id } }),
    ).toBe(1)
    const ev = {
      id: eventId,
      type: 'payment_intent.created',
      livemode: false,
      data: {
        object: { object: 'payment_intent', id: first.providerIntentId },
      },
    }
    const raw = Buffer.from(JSON.stringify(ev))
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`
    expect(await payments.receiveWebhook(raw, signature)).toEqual({
      received: true,
    })
    expect(await payments.receiveWebhook(raw, signature)).toEqual({
      received: true,
    })
    expect(
      await f.db.paymentWebhookReceipt.count({
        where: { providerEventId: ev.id },
      }),
    ).toBe(1)
    expect(
      (await f.db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PENDING_PAYMENT')
    const remaining = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { id: balance.id },
    })
    expect(remaining.onHand).toBe(3)
    expect(remaining.reservedQuantity).toBe(2)
    expect(
      (
        await request.post(`/v1/orders/${order.id}/cancel`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)
  } finally {
    await f.db.paymentWebhookReceipt.deleteMany({
      where: { providerEventId: eventId },
    })
    if (prior)
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: prior.shippingMinor,
          freeOverSubtotalMinor: prior.freeOverSubtotalMinor,
          taxBps: prior.taxBps,
          enabled: prior.enabled,
        },
      })
    else
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    await f.close()
  }
})
