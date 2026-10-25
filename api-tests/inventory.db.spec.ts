import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  CatalogTestFixture,
  bearer,
  assertSafeError,
} from './catalog-test-support'

test.describe('Phase 03B stock balances / ledger — isolated real PostgreSQL', () => {
  test('opening stock, SKU list, thresholds, idempotency, rollbacks and Catalog write-block', async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    try {
      const owner = await f.account('OWNER')
      const auth = bearer(owner.token)
      const catRes = await request.post('/v1/admin/categories', {
        headers: auth,
        data: { name: 'Inventory QA', slug: f.slug('category') },
      })
      expect(catRes.status()).toBe(201)
      const categoryId = (await catRes.json()).id as string
      const prodRes = await request.post('/v1/admin/products', {
        headers: auth,
        data: {
          title: 'Inventory QA',
          slug: f.slug('product'),
          sku: f.sku('item'),
          priceMinor: 100,
          stockOnHand: 5,
          categoryIds: [categoryId],
        },
      })
      expect(prodRes.status()).toBe(201)
      const productId = (await prodRes.json()).id as string
      const inventory = await f.db.inventoryBalance.findUniqueOrThrow({
        where: { productId },
      })
      expect(inventory.onHand).toBe(5)
      expect(
        await f.db.inventoryMovement.count({
          where: { balanceId: inventory.id, reason: 'OPENING' },
        }),
      ).toBe(1)

      const detail = await request.get(`/v1/admin/inventory/${inventory.id}`, {
        headers: auth,
      })
      expect(detail.status()).toBe(200)
      expect((await detail.json()).sku).toBe(f.sku('item'))
      const list = await request.get(
        '/v1/admin/inventory?page=1&limit=10&lowStock=true',
        { headers: auth },
      )
      expect(list.status()).toBe(200)
      expect(
        (await list.json()).items.some(
          (item: { id: string }) => item.id === inventory.id,
        ),
      ).toBe(true)

      const threshold = await request.patch(
        `/v1/admin/inventory/${inventory.id}/threshold`,
        {
          headers: auth,
          data: { lowStockThreshold: 2 },
        },
      )
      expect(threshold.status()).toBe(200)
      expect((await threshold.json()).lowStock).toBe(false)
      const key = randomUUID()
      const data = {
        requestId: key,
        delta: 8,
        reason: 'RECEIPT',
        note: 'warehouse restock',
      }
      const first = await request.post(
        `/v1/admin/inventory/${inventory.id}/adjustments`,
        { headers: auth, data },
      )
      expect(first.status()).toBe(201)
      expect((await first.json()).inventory.onHand).toBe(13)
      const replay = await request.post(
        `/v1/admin/inventory/${inventory.id}/adjustments`,
        { headers: auth, data },
      )
      expect(replay.status()).toBe(201)
      expect((await replay.json()).replayed).toBe(true)
      const countBefore = await f.db.inventoryMovement.count({
        where: { balanceId: inventory.id },
      })
      await assertSafeError(
        await request.post(`/v1/admin/inventory/${inventory.id}/adjustments`, {
          headers: auth,
          data: { ...data, delta: 9 },
        }),
        409,
      )
      expect(
        await f.db.inventoryMovement.count({
          where: { balanceId: inventory.id },
        }),
      ).toBe(countBefore)

      const decrement = await request.post(
        `/v1/admin/inventory/${inventory.id}/adjustments`,
        {
          headers: auth,
          data: { requestId: randomUUID(), delta: -3, reason: 'DAMAGE' },
        },
      )
      expect(decrement.status()).toBe(201)
      expect((await decrement.json()).inventory.onHand).toBe(10)
      await assertSafeError(
        await request.post(`/v1/admin/inventory/${inventory.id}/adjustments`, {
          headers: auth,
          data: { requestId: randomUUID(), delta: -11, reason: 'CORRECTION' },
        }),
        409,
      )
      expect(
        (
          await f.db.inventoryBalance.findUniqueOrThrow({
            where: { id: inventory.id },
          })
        ).onHand,
      ).toBe(10)
      expect(
        (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
          .stockOnHand,
      ).toBe(10)
      await assertSafeError(
        await request.patch(`/v1/admin/products/${productId}`, {
          headers: auth,
          data: { stockOnHand: 100 },
        }),
        400,
      )
      expect(
        (await f.db.product.findUniqueOrThrow({ where: { id: productId } }))
          .stockOnHand,
      ).toBe(10)
      const history = await request.get(
        `/v1/admin/inventory/${inventory.id}/movements?page=1&limit=20`,
        { headers: auth },
      )
      expect(history.status()).toBe(200)
      expect((await history.json()).total).toBe(countBefore + 1)
      expect(
        await f.db.auditEvent.count({
          where: { actorId: owner.id, action: 'inventory.adjusted' },
        }),
      ).toBe(2)
    } finally {
      await f.close()
    }
  })

  test('concurrent adjustments never oversell or lose increments; variant inventory independent', async ({
    request,
  }) => {
    const f = new CatalogTestFixture(request)
    try {
      const owner = await f.account('OWNER')
      const auth = bearer(owner.token)
      const c = await request.post('/v1/admin/categories', {
        headers: auth,
        data: { name: 'Concurrency', slug: f.slug('c') },
      })
      expect(c.status()).toBe(201)
      const categoryId = (await c.json()).id as string
      const p = await request.post('/v1/admin/products', {
        headers: auth,
        data: {
          title: 'Variant concurrency',
          slug: f.slug('p'),
          sku: f.sku('parent'),
          priceMinor: 100,
          categoryIds: [categoryId],
          variants: [
            { sku: f.sku('red'), options: { color: 'Red' }, stockOnHand: 4 },
            { sku: f.sku('blue'), options: { color: 'Blue' }, stockOnHand: 1 },
          ],
        },
      })
      expect(p.status()).toBe(201)
      const product = (await p.json()) as {
        id: string
        variants: Array<{ id: string; sku: string }>
      }
      const variant = product.variants.find((v) => v.sku === f.sku('red'))!
      const blue = product.variants.find((v) => v.sku === f.sku('blue'))!
      const balance = await f.db.inventoryBalance.findUniqueOrThrow({
        where: { variantId: variant.id },
      })
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request.post(`/v1/admin/inventory/${balance.id}/adjustments`, {
            headers: auth,
            data: { requestId: randomUUID(), delta: -1, reason: 'CORRECTION' },
          }),
        ),
      )
      expect(results.filter((r) => r.status() === 201)).toHaveLength(4)
      expect(results.filter((r) => r.status() === 409)).toHaveLength(6)
      expect(
        (
          await f.db.inventoryBalance.findUniqueOrThrow({
            where: { id: balance.id },
          })
        ).onHand,
      ).toBe(0)
      expect(
        (
          await f.db.productVariant.findUniqueOrThrow({
            where: { id: variant.id },
          })
        ).stockOnHand,
      ).toBe(0)
      expect(
        (
          await f.db.productVariant.findUniqueOrThrow({
            where: { id: blue.id },
          })
        ).stockOnHand,
      ).toBe(1)
      expect(
        await f.db.inventoryMovement.count({
          where: { balanceId: balance.id },
        }),
      ).toBe(5)
      const parentBalance = await f.db.inventoryBalance.findUniqueOrThrow({
        where: { productId: product.id },
      })
      await assertSafeError(
        await request.get(`/v1/admin/inventory/${parentBalance.id}`, {
          headers: auth,
        }),
        404,
      )
      await assertSafeError(
        await request.patch(
          `/v1/admin/products/${product.id}/variants/${variant.id}`,
          { headers: auth, data: { stockOnHand: 99 } },
        ),
        400,
      )
    } finally {
      await f.close()
    }
  })
})
