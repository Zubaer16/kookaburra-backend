import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CatalogTestFixture, bearer } from './catalog-test-support'
import { ReservationService } from '../src/checkout/reservation.service'
import { DatabaseService } from '../src/database/database.service'

const countryCode = 'CK'
const currency = 'USD'

test('04B-2 real DB: concurrent customers, idempotent hold, inventory guard, expiry and release', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const first = await f.account('CUSTOMER')
    const second = await f.account('CUSTOMER')
    const ownerAuth = bearer(owner.token)
    const cat = await request.post('/v1/admin/categories', {
      headers: ownerAuth,
      data: { name: 'Hold QA', slug: f.slug('hold') },
    })
    const prod = await request.post('/v1/admin/products', {
      headers: ownerAuth,
      data: {
        title: 'Hold item',
        slug: f.slug('hold-p'),
        sku: f.sku('hold'),
        priceMinor: 500,
        currency,
        status: 'ACTIVE',
        stockOnHand: 3,
        categoryIds: [(await cat.json()).id],
      },
    })
    expect(prod.status()).toBe(201)
    const productId = (await prod.json()).id as string
    const balance = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 30,
        taxBps: 500,
        enabled: true,
      },
      update: {
        shippingMinor: 30,
        freeOverSubtotalMinor: null,
        taxBps: 500,
        enabled: true,
      },
    })
    for (const user of [first, second]) {
      const cart = await request.put('/v1/cart/items', {
        headers: bearer(user.token),
        data: { productId, quantity: 2 },
      })
      expect(cart.status()).toBe(200)
    }
    const firstKey = randomUUID()
    const secondKey = randomUUID()
    const reserve = (token: string, requestId: string) =>
      request.post('/v1/checkout/reservations', {
        headers: bearer(token),
        data: { requestId, countryCode },
      })
    const simultaneous = await Promise.all([
      reserve(first.token, firstKey),
      reserve(second.token, secondKey),
    ])
    expect(simultaneous.map((r) => r.status()).sort()).toEqual([200, 409])
    const winner = simultaneous[0]!.status() === 200 ? first : second
    const loser = simultaneous[0]!.status() === 200 ? second : first
    const winKey = winner === first ? firstKey : secondKey
    const saved = await (
      simultaneous[0]!.status() === 200 ? simultaneous[0]! : simultaneous[1]!
    ).json()
    expect(saved).toMatchObject({
      status: 'ACTIVE',
      subtotalMinor: 1000,
      shippingMinor: 30,
      taxMinor: 50,
      estimatedTotalMinor: 1080,
      payable: false,
    })
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
    expect((await reserve(winner.token, winKey)).status()).toBe(200)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(2)
    expect((await reserve(winner.token, randomUUID())).status()).toBe(409)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(winner.token),
          data: { productId, quantity: 1 },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await request.get(`/v1/checkout/reservations/${saved.id}`, {
          headers: bearer(loser.token),
        })
      ).status(),
    ).toBe(404)
    expect(
      (
        await request.delete(`/v1/checkout/reservations/${saved.id}`, {
          headers: bearer(loser.token),
        })
      ).status(),
    ).toBe(404)
    // Physical stock cannot be written below active held quantity.
    expect(
      (
        await request.post(`/v1/admin/inventory/${balance.id}/adjustments`, {
          headers: ownerAuth,
          data: { requestId: randomUUID(), reason: 'DAMAGE', delta: -2 },
        })
      ).status(),
    ).toBe(409)
    const release = () =>
      request.delete(`/v1/checkout/reservations/${saved.id}`, {
        headers: bearer(winner.token),
      })
    expect((await release()).status()).toBe(200)
    expect((await (await release()).json()).status).toBe('RELEASED')
    expect((await (await reserve(winner.token, winKey)).json()).status).toBe(
      'RELEASED',
    )
    expect((await reserve(winner.token, winKey)).status()).toBe(200)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)
    const next = await reserve(loser.token, randomUUID())
    expect(next.status()).toBe(200)
    const secondHold = await next.json()
    // Expiry via guarded worker is idempotent and returns physical availability.
    await f.db.checkoutReservation.update({
      where: { id: secondHold.id },
      data: { expiresAt: new Date(Date.now() - 2000) },
    })
    const worker = new ReservationService({
      client: f.db,
    } as unknown as DatabaseService)
    expect((await worker.expireBatch(20)).expired).toBeGreaterThanOrEqual(1)
    expect((await worker.expireBatch(20)).expired).toBe(0)
    expect(
      (
        await (
          await request.get(`/v1/checkout/reservations/${secondHold.id}`, {
            headers: bearer(loser.token),
          })
        ).json()
      ).status,
    ).toBe('EXPIRED')
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { id: balance.id },
        })
      ).reservedQuantity,
    ).toBe(0)
    expect(
      (
        await request.put('/v1/cart/items', {
          headers: bearer(loser.token),
          data: { productId, quantity: 2 },
        })
      ).status(),
    ).toBe(200)
  } finally {
    if (prior) {
      await f.db.checkoutRate.update({
        where: { countryCode_currency: { countryCode, currency } },
        data: {
          shippingMinor: prior.shippingMinor,
          freeOverSubtotalMinor: prior.freeOverSubtotalMinor,
          taxBps: prior.taxBps,
          enabled: prior.enabled,
        },
      })
    } else {
      await f.db.checkoutRate.deleteMany({ where: { countryCode, currency } })
    }
    await f.close()
  }
})

test('04B-2 real DB: variant holds are independent and never mutate physical SKU mirrors', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  const prior = await f.db.checkoutRate.findUnique({
    where: { countryCode_currency: { countryCode, currency } },
  })
  try {
    const owner = await f.account('OWNER')
    const c1 = await f.account('CUSTOMER')
    const c2 = await f.account('CUSTOMER')
    const cat = await request.post('/v1/admin/categories', {
      headers: bearer(owner.token),
      data: { name: 'Variants Hold', slug: f.slug('c') },
    })
    const prod = await request.post('/v1/admin/products', {
      headers: bearer(owner.token),
      data: {
        title: 'Variant hold',
        slug: f.slug('p'),
        sku: f.sku('parent'),
        status: 'ACTIVE',
        priceMinor: 1000,
        currency,
        categoryIds: [(await cat.json()).id],
        variants: [
          { sku: f.sku('red'), options: { color: 'Red' }, stockOnHand: 1 },
          { sku: f.sku('blue'), options: { color: 'Blue' }, stockOnHand: 2 },
        ],
      },
    })
    expect(prod.status()).toBe(201)
    const p = (await prod.json()) as {
      id: string
      variants: Array<{ id: string; sku: string }>
    }
    const red = p.variants.find((v) => v.sku === f.sku('red'))!
    const blue = p.variants.find((v) => v.sku === f.sku('blue'))!
    await f.db.checkoutRate.upsert({
      where: { countryCode_currency: { countryCode, currency } },
      create: {
        countryCode,
        currency,
        shippingMinor: 0,
        taxBps: 0,
        enabled: true,
      },
      update: { shippingMinor: 0, taxBps: 0, enabled: true },
    })
    for (const [who, variant] of [
      [c1, red],
      [c2, blue],
    ] as const) {
      expect(
        (
          await request.put('/v1/cart/items', {
            headers: bearer(who.token),
            data: {
              productId: p.id,
              variantId: variant.id,
              quantity: 1,
            },
          })
        ).status(),
      ).toBe(200)
    }
    const hold1 = await request.post('/v1/checkout/reservations', {
      headers: bearer(c1.token),
      data: { requestId: randomUUID(), countryCode },
    })
    const hold2 = await request.post('/v1/checkout/reservations', {
      headers: bearer(c2.token),
      data: { requestId: randomUUID(), countryCode },
    })
    expect([hold1.status(), hold2.status()]).toEqual([200, 200])
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { variantId: red.id },
        })
      ).reservedQuantity,
    ).toBe(1)
    expect(
      (
        await f.db.inventoryBalance.findUniqueOrThrow({
          where: { variantId: blue.id },
        })
      ).reservedQuantity,
    ).toBe(1)
    expect(
      (await f.db.productVariant.findUniqueOrThrow({ where: { id: red.id } }))
        .stockOnHand,
    ).toBe(1)
    expect(
      (await f.db.productVariant.findUniqueOrThrow({ where: { id: blue.id } }))
        .stockOnHand,
    ).toBe(2)
    expect(
      (
        await request.delete(
          `/v1/checkout/reservations/${(await hold1.json()).id}`,
          { headers: bearer(c1.token) },
        )
      ).status(),
    ).toBe(200)
    expect(
      (
        await request.delete(
          `/v1/checkout/reservations/${(await hold2.json()).id}`,
          { headers: bearer(c2.token) },
        )
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
