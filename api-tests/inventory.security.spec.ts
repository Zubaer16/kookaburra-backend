import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import {
  CatalogTestFixture,
  assertSafeError,
  bearer,
} from './catalog-test-support'

test('Phase 03B: all Inventory endpoints require valid Admin bearer; STAFF reads only', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const staff = await f.account('STAFF')
    const customer = await f.account('CUSTOMER')
    const id = randomUUID()
    const requests = [
      ['GET', '/v1/admin/inventory', undefined],
      ['GET', `/v1/admin/inventory/${id}`, undefined],
      ['GET', `/v1/admin/inventory/${id}/movements`, undefined],
      [
        'PATCH',
        `/v1/admin/inventory/${id}/threshold`,
        { lowStockThreshold: 1 },
      ],
      [
        'POST',
        `/v1/admin/inventory/${id}/adjustments`,
        { requestId: randomUUID(), delta: 1, reason: 'RECEIPT' },
      ],
    ] as const
    for (const [method, path, data] of requests) {
      await assertSafeError(
        await request.fetch(path, { method, ...(data && { data }) }),
        401,
      )
      await assertSafeError(
        await request.fetch(path, {
          method,
          headers: bearer('invalid.jwt.token'),
          ...(data && { data }),
        }),
        401,
      )
      await assertSafeError(
        await request.fetch(path, {
          method,
          headers: bearer(customer.token),
          ...(data && { data }),
        }),
        403,
      )
    }
    const secret = process.env.JWT_ACCESS_SECRET
    if (!secret) throw new Error('Missing isolated test JWT secret')
    const expired = await new JwtService().signAsync(
      { sub: owner.id, typ: 'access' },
      {
        secret,
        algorithm: 'HS256',
        issuer: 'commerce-api',
        audience: 'commerce-clients',
        expiresIn: -60,
      },
    )
    await assertSafeError(
      await request.get('/v1/admin/inventory', { headers: bearer(expired) }),
      401,
    )
    expect(
      (
        await request.get('/v1/admin/inventory', {
          headers: bearer(staff.token),
        })
      ).status(),
    ).toBe(200)
    for (const [method, path, data] of requests.slice(3)) {
      await assertSafeError(
        await request.fetch(path, {
          method,
          headers: bearer(staff.token),
          ...(data && { data }),
        }),
        403,
      )
    }
    await assertSafeError(
      await request.get('/v1/admin/inventory/not-uuid', {
        headers: bearer(owner.token),
      }),
      400,
    )
    await assertSafeError(
      await request.get(`/v1/admin/inventory/${id}`, {
        headers: bearer(owner.token),
      }),
      404,
    )
  } finally {
    await f.close()
  }
})

test('Phase 03B: mass-assignment, malformed and forbidden adjustments do not mutate balances', async ({
  request,
}) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const auth = bearer(owner.token)
    const c = await request.post('/v1/admin/categories', {
      headers: auth,
      data: { name: 'Guarded', slug: f.slug('cat') },
    })
    expect(c.status()).toBe(201)
    const categoryId = (await c.json()).id as string
    const p = await request.post('/v1/admin/products', {
      headers: auth,
      data: {
        title: 'Guarded SKU',
        slug: f.slug('product'),
        sku: f.sku('product'),
        priceMinor: 100,
        stockOnHand: 3,
        categoryIds: [categoryId],
      },
    })
    expect(p.status()).toBe(201)
    const productId = (await p.json()).id as string
    const b = await f.db.inventoryBalance.findUniqueOrThrow({
      where: { productId },
    })
    const before = await f.db.inventoryMovement.count({
      where: { balanceId: b.id },
    })
    for (const [label, payload] of [
      ['missing requestId', { delta: 1, reason: 'RECEIPT' }],
      [
        'zero delta',
        { requestId: randomUUID(), delta: 0, reason: 'CORRECTION' },
      ],
      [
        'fractional',
        { requestId: randomUUID(), delta: 0.5, reason: 'CORRECTION' },
      ],
      [
        'overflow',
        { requestId: randomUUID(), delta: 2147483648, reason: 'CORRECTION' },
      ],
      [
        'mass assignment',
        { requestId: randomUUID(), delta: 1, reason: 'RECEIPT', onHand: 9000 },
      ],
      ['wrong enum', { requestId: randomUUID(), delta: 1, reason: 'OPENING' }],
      [
        'wrong direction',
        { requestId: randomUUID(), delta: -1, reason: 'RECEIPT' },
      ],
      [
        'wrong direction damage',
        { requestId: randomUUID(), delta: 1, reason: 'DAMAGE' },
      ],
    ] as const) {
      await test.step(label, async () => {
        await assertSafeError(
          await request.post(`/v1/admin/inventory/${b.id}/adjustments`, {
            headers: auth,
            data: payload,
          }),
          400,
        )
      })
    }
    await assertSafeError(
      await request.post(`/v1/admin/inventory/${b.id}/adjustments`, {
        headers: { ...auth, 'Content-Type': 'application/json' },
        data: '{"invalid":',
      }),
      400,
    )
    await assertSafeError(
      await request.patch(`/v1/admin/inventory/${b.id}/threshold`, {
        headers: auth,
        data: { lowStockThreshold: -1 },
      }),
      400,
    )
    expect(
      (await f.db.inventoryBalance.findUniqueOrThrow({ where: { id: b.id } }))
        .onHand,
    ).toBe(3)
    expect(
      await f.db.inventoryMovement.count({ where: { balanceId: b.id } }),
    ).toBe(before)
    expect(
      (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockOnHand,
    ).toBe(3)
    expect(
      await f.db.auditEvent.count({
        where: { actorId: owner.id, action: 'inventory.adjusted' },
      }),
    ).toBe(0)
  } finally {
    await f.close()
  }
})
