import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

const countryCode = 'CK'
const currency = 'USD'

test('04D-2A real DB: return quantity ceiling, inspection, exactly-once restock, damaged isolation', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const customer = await f.account('CUSTOMER')
    const stranger = await f.account('CUSTOMER')
    const cat = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Returns QA', slug: f.slug('return-cat') },
    })
    expect(cat.status()).toBe(201)
    const product = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Returns QA Product',
        slug: f.slug('return-item'),
        sku: f.sku('return'),
        priceMinor: 1000,
        currency,
        status: 'ACTIVE',
        stockOnHand: 5,
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
        shippingMinor: 0,
        taxBps: 0,
        enabled: true,
      },
      update: {
        shippingMinor: 0,
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
    const held = await request.post('/v1/checkout/reservations', {
      headers: bearer(customer.token),
      data: { requestId: randomUUID(), countryCode },
    })
    expect(held.status()).toBe(200)
    const orderRes = await request.post('/v1/orders', {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        reservationId: (await held.json()).id,
        shippingAddress: {
          recipientName: 'Returns QA',
          phone: '+12025550123',
          addressLine1: '1 Test Avenue',
          city: 'Testville',
          countryCode,
        },
      },
    })
    expect(orderRes.status()).toBe(200)
    const orderBody = await orderRes.json()
    const orderId = orderBody.id as string
    const lineId = orderBody.lines[0].id as string
    expect(lineId).toMatch(/^[a-f0-9-]{36}$/)
    // Arrange an already-settled PAID order with a physically deducted sale; this
    // fixture does not call an external payment gateway and does not settle money.
    const intentId = `pi_Returns${f.key}123456`
    const attempt = await f.db.paymentAttempt.create({
      data: {
        orderId,
        providerIntentId: intentId,
        idempotencyKey: `qa-returns-${f.key}`,
        status: 'SETTLED',
        amountMinor: orderBody.totalMinor,
        currency,
      },
    })
    await f.db.paymentTransaction.create({
      data: {
        orderId,
        paymentAttemptId: attempt.id,
        providerIntentId: intentId,
        amountMinor: orderBody.totalMinor,
        currency,
      },
    })
    await f.db.order.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date() },
    })
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    await f.db.inventoryBalance.update({
      where: { id: balance.id },
      data: { onHand: 3, reservedQuantity: 0 },
    })
    await f.db.product.update({
      where: { id: productId },
      data: { stockOnHand: 3 },
    })
    await f.db.inventoryMovement.create({
      data: {
        balanceId: balance.id,
        requestId: randomUUID(),
        reason: 'SALE',
        delta: -2,
        before: 5,
        after: 3,
        note: 'Test paid-order setup',
      },
    })
    for (const [op, payload] of [
      ['start', { requestId: randomUUID() }],
      [
        'ship',
        {
          requestId: randomUUID(),
          carrier: 'UPS',
          trackingNumber: 'TEST123456',
        },
      ],
      ['deliver', { requestId: randomUUID() }],
    ] as const) {
      expect(
        (
          await request.post(`/v1/admin/orders/${orderId}/fulfillment/${op}`, {
            headers: bearer(owner.token),
            data: payload,
          })
        ).status(),
      ).toBe(200)
    }
    const url = `/v1/orders/${orderId}/returns`
    const first = {
      requestId: randomUUID(),
      orderLineId: lineId,
      quantity: 1,
      reason: 'OTHER',
    }
    const create1 = await request.post(url, {
      headers: bearer(customer.token),
      data: first,
    })
    expect(create1.status()).toBe(200)
    const returnId = (await create1.json()).id as string
    const retry = await request.post(url, {
      headers: bearer(customer.token),
      data: first,
    })
    expect(retry.status()).toBe(200)
    expect((await retry.json()).id).toBe(returnId)
    // G1-4: only pending returns can be withdrawn; no physical or money movement.
    const pendingData = {
      requestId: randomUUID(),
      orderLineId: lineId,
      quantity: 1,
      reason: 'OTHER',
    }
    const pending = await request.post(url, {
      headers: bearer(customer.token),
      data: pendingData,
    })
    expect(pending.status()).toBe(200)
    const pendingId = (await pending.json()).id as string
    const withdrawUrl = `${url}/${pendingId}/cancel`
    const withdrawBody = { requestId: randomUUID() }
    const [withdraw1, withdraw2] = await Promise.all([
      request.post(withdrawUrl, {
        headers: bearer(customer.token),
        data: withdrawBody,
      }),
      request.post(withdrawUrl, {
        headers: bearer(customer.token),
        data: withdrawBody,
      }),
    ])
    expect([withdraw1.status(), withdraw2.status()]).toEqual([200, 200])
    expect((await withdraw1.json()).status).toBe('CANCELLED')
    expect(
      (await f.db.orderReturn.findUniqueOrThrow({ where: { id: pendingId } }))
        .status,
    ).toBe('CANCELLED')
    expect(
      await f.db.orderReturnEvent.count({
        where: { returnId: pendingId, action: 'CANCEL' },
      }),
    ).toBe(1)
    expect(
      (
        await request.post(url, {
          headers: bearer(customer.token),
          data: pendingData,
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post(withdrawUrl, {
          headers: bearer(customer.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post(withdrawUrl, {
          headers: bearer(stranger.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.post(
          `/v1/admin/orders/${orderId}/returns/${pendingId}/approve`,
          {
            headers: bearer(owner.token),
            data: { requestId: randomUUID() },
          },
        )
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post(
          `/v1/admin/orders/${orderId}/replacements/returns/${pendingId}/authorize`,
          {
            headers: bearer(owner.token),
            data: { requestId: randomUUID() },
          },
        )
      ).status(),
    ).toBe(409)
    // A new request can use the withdrawn quantity. The cancelled record remains.
    const reRequested = await request.post(url, {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        orderLineId: lineId,
        quantity: 1,
        reason: 'OTHER',
      },
    })
    expect(reRequested.status()).toBe(200)
    const reRequestedId = (await reRequested.json()).id as string
    expect(
      (
        await request.post(`${url}/${reRequestedId}/cancel`, {
          headers: bearer(customer.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(200)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'RETURN' },
      }),
    ).toBe(0)
    expect(await f.db.refundRequest.count({ where: { orderId } })).toBe(0)
    expect(
      (
        await request.post(url, {
          headers: bearer(customer.token),
          data: { ...first, quantity: 2 },
        })
      ).status(),
    ).toBe(409)
    const [overA, overB] = await Promise.all(
      [2, 2].map((quantity) =>
        request.post(url, {
          headers: bearer(customer.token),
          data: {
            requestId: randomUUID(),
            orderLineId: lineId,
            quantity,
            reason: 'DAMAGED',
          },
        }),
      ),
    )
    expect([overA.status(), overB.status()]).toEqual([409, 409])
    expect(
      (
        await request.post(url, {
          headers: bearer(stranger.token),
          data: first,
        })
      ).status(),
    ).toBe(404)
    const action = (name: string, id: string, data: object) =>
      request.post(`/v1/admin/orders/${orderId}/returns/${id}/${name}`, {
        headers: bearer(owner.token),
        data,
      })
    // Replacement authorization must not bypass pending-return inspection.
    expect(
      (
        await request.post(
          `/v1/admin/orders/${orderId}/replacements/returns/${returnId}/authorize`,
          { headers: bearer(owner.token), data: { requestId: randomUUID() } },
        )
      ).status(),
    ).toBe(409)
    const approve = { requestId: randomUUID() }
    expect((await action('approve', returnId, approve)).status()).toBe(200)
    expect((await action('approve', returnId, approve)).status()).toBe(200)
    expect(
      (
        await request.post(`${url}/${returnId}/cancel`, {
          headers: bearer(customer.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    const receive = { requestId: randomUUID(), condition: 'RESTOCKABLE' }
    expect((await action('receive', returnId, receive)).status()).toBe(200)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(3)
    const restock = { requestId: randomUUID() }
    const [restockedA, restockedB] = await Promise.all([
      action('restock', returnId, restock),
      action('restock', returnId, restock),
    ])
    expect([restockedA.status(), restockedB.status()]).toEqual([200, 200])
    expect((await restockedA.json()).status).toBe('RESTOCKED')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(4)
    expect(
      (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockOnHand,
    ).toBe(4)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'RETURN' },
      }),
    ).toBe(1)
    expect(
      (await action('restock', returnId, { requestId: randomUUID() })).status(),
    ).toBe(409)
    // Cancellation before dispatch creates no stock movement and is terminal.
    const firstAuthorization = await request.post(
      `/v1/admin/orders/${orderId}/replacements/returns/${returnId}/authorize`,
      { headers: bearer(owner.token), data: { requestId: randomUUID() } },
    )
    expect(firstAuthorization.status()).toBe(200)
    const firstReplacementId = (await firstAuthorization.json()).id as string
    const firstReplacementUrl = `/v1/admin/orders/${orderId}/replacements/${firstReplacementId}`
    const cancelReplacement = { requestId: randomUUID() }
    expect(
      (
        await request.post(`${firstReplacementUrl}/cancel`, {
          headers: bearer(owner.token),
          data: cancelReplacement,
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post(`${firstReplacementUrl}/cancel`, {
          headers: bearer(owner.token),
          data: cancelReplacement,
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post(`${firstReplacementUrl}/ship`, {
          headers: bearer(owner.token),
          data: {
            requestId: randomUUID(),
            carrier: 'DHL',
            trackingNumber: 'REPL123456',
          },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post(
          `/v1/admin/orders/${orderId}/replacements/returns/${returnId}/authorize`,
          { headers: bearer(owner.token), data: { requestId: randomUUID() } },
        )
      ).status(),
    ).toBe(409)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(4)
    // A damaged second return cannot automatically increase stock.
    const create2 = await request.post(url, {
      headers: bearer(customer.token),
      data: {
        requestId: randomUUID(),
        orderLineId: lineId,
        quantity: 1,
        reason: 'DAMAGED',
      },
    })
    expect(create2.status()).toBe(200)
    const damagedId = (await create2.json()).id as string
    expect(
      (
        await action('approve', damagedId, { requestId: randomUUID() })
      ).status(),
    ).toBe(200)
    expect(
      (
        await action('receive', damagedId, {
          requestId: randomUUID(),
          condition: 'DAMAGED',
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await action('restock', damagedId, { requestId: randomUUID() })
      ).status(),
    ).toBe(409)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(4)
    // G1/04D-2B-1: inspected return -> separate same-SKU replacement.
    // No money, restock or inventory allocation at authorization.
    const replacementBase = `/v1/admin/orders/${orderId}/replacements`
    const authorize = { requestId: randomUUID() }
    const authorized = await request.post(
      `${replacementBase}/returns/${damagedId}/authorize`,
      { headers: bearer(owner.token), data: authorize },
    )
    expect(authorized.status()).toBe(200)
    const replacementId = (await authorized.json()).id as string
    expect((await authorized.json()).status).toBe('AUTHORIZED')
    expect(
      (
        await request.post(
          `${replacementBase}/returns/${damagedId}/authorize`,
          {
            headers: bearer(owner.token),
            data: authorize,
          },
        )
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post(`${replacementBase}/returns/${returnId}/authorize`, {
          headers: bearer(owner.token),
          data: authorize,
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post(
          `${replacementBase}/returns/${damagedId}/authorize`,
          {
            headers: bearer(owner.token),
            data: { requestId: randomUUID() },
          },
        )
      ).status(),
    ).toBe(409)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(4)
    const replacementUrl = `${replacementBase}/${replacementId}`
    const ship = {
      requestId: randomUUID(),
      carrier: 'DHL',
      trackingNumber: 'REPLACEMENT123',
    }
    // Existing reservations win over nonreserved replacements.
    await f.db.inventoryBalance.update({
      where: { id: balance.id },
      data: { reservedQuantity: 4 },
    })
    expect(
      (
        await request.post(`${replacementUrl}/ship`, {
          headers: bearer(owner.token),
          data: ship,
        })
      ).status(),
    ).toBe(409)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'REPLACEMENT' },
      }),
    ).toBe(0)
    await f.db.inventoryBalance.update({
      where: { id: balance.id },
      data: { reservedQuantity: 0 },
    })
    const [shippedA, shippedB] = await Promise.all([
      request.post(`${replacementUrl}/ship`, {
        headers: bearer(owner.token),
        data: ship,
      }),
      request.post(`${replacementUrl}/ship`, {
        headers: bearer(owner.token),
        data: ship,
      }),
    ])
    expect([shippedA.status(), shippedB.status()]).toEqual([200, 200])
    expect((await shippedA.json()).status).toBe('SHIPPED')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).onHand,
    ).toBe(3)
    expect(
      (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockOnHand,
    ).toBe(3)
    expect(
      await f.db.inventoryMovement.count({
        where: { balanceId: balance.id, reason: 'REPLACEMENT' },
      }),
    ).toBe(1)
    expect(
      (
        await request.post(`${replacementUrl}/cancel`, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.post(`${replacementUrl}/deliver`, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.post(`${replacementUrl}/deliver`, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID() },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.get(`/v1/orders/${orderId}/replacements`, {
          headers: bearer(customer.token),
        })
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.get(`/v1/orders/${orderId}/replacements`, {
          headers: bearer(stranger.token),
        })
      ).status(),
    ).toBe(404)
    expect(await f.db.refundRequest.count({ where: { orderId } })).toBe(0)
    expect(
      (
        await request.post(`/v1/admin/payments/orders/${orderId}/refunds`, {
          headers: bearer(owner.token),
          data: { requestId: randomUUID(), amountMinor: 100, reason: 'OTHER' },
        })
      ).status(),
    ).toBe(409)
    expect(
      (await request.get(url, { headers: bearer(customer.token) })).status(),
    ).toBe(200)
    expect(
      (
        await request.get(`/v1/admin/orders/${orderId}/returns`, {
          headers: bearer(owner.token),
        })
      ).status(),
    ).toBe(200)
  } finally {
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
