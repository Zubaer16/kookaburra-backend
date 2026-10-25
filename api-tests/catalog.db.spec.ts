import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/** Real DB tests; guarded by scripts/run-api-tests.cjs, never dev/live DB. */
function database(): PrismaClient {
  const urlString = process.env.DATABASE_URL
  if (process.env.API_TEST_MODE !== 'db' || !urlString) throw new Error('Use npm run test:api:db')
  const url = new URL(urlString)
  if (decodeURIComponent(url.pathname.slice(1)) !== 'kookaburra_api_test' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw new Error('Refusing non-local / non-test database')
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlString }) })
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

test('Phase 03A: categories, products, variants, publication and authorization', async ({ request }) => {
  const db = database()
  const suffix = randomUUID().slice(0, 8)
  const email = `catalog-${randomUUID()}@example.test`
  const password = `Catalog-${randomUUID()}-Aa1!`
  const categories: string[] = []
  let userId: string | undefined
  let productId: string | undefined
  try {
    const register = await request.post('/v1/auth/register', { data: { email, password } })
    expect(register.status()).toBe(201)
    const customer = await register.json()
    userId = customer.user.id
    const customerWrite = await request.post('/v1/admin/categories', {
      headers: bearer(customer.accessToken), data: { name: 'Unauthorized', slug: `unauthorized-${suffix}` },
    })
    expect(customerWrite.status()).toBe(403)
    await db.user.update({ where: { id: userId }, data: { role: 'OWNER' } })
    const login = await request.post('/v1/admin/auth/login', { data: { email, password } })
    expect(login.status()).toBe(200)
    const ownerToken = (await login.json()).accessToken as string
    const auth = bearer(ownerToken)

    const root = await request.post('/v1/admin/categories', {
      headers: auth, data: { name: 'Test Accessories', slug: `accessories-${suffix}` },
    })
    expect(root.status()).toBe(201)
    const rootCat = await root.json()
    categories.push(rootCat.id)
    const child = await request.post('/v1/admin/categories', {
      headers: auth, data: { name: 'Test Tech', slug: `tech-${suffix}`, parentId: rootCat.id },
    })
    expect(child.status()).toBe(201)
    const childCat = await child.json()
    categories.push(childCat.id)

    const cycle = await request.patch(`/v1/admin/categories/${rootCat.id}`, {
      headers: auth, data: { parentId: childCat.id },
    })
    expect(cycle.status()).toBe(409)
    const blockedDelete = await request.delete(`/v1/admin/categories/${rootCat.id}`, { headers: auth })
    expect(blockedDelete.status()).toBe(409)

    const create = await request.post('/v1/admin/products', { headers: auth, data: {
      title: `Test Headphones ${suffix}`, slug: `headphones-${suffix}`,
      sku: `HEAD-${suffix}`, priceMinor: 12999, currency: 'USD',
      status: 'ACTIVE', categoryIds: [childCat.id],
      variants: [
        { sku: `HEAD-${suffix}-BLK`, options: { color: 'Black', size: 'M' }, stockOnHand: 2 },
        { sku: `HEAD-${suffix}-WHT`, options: { color: 'White', size: 'M' }, stockOnHand: 3 },
      ],
    } })
    expect(create.status()).toBe(201)
    const item = await create.json()
    productId = item.id
    expect(item.variants).toHaveLength(2)
    expect(item.hasVariants).toBe(true)
    expect(item.stockOnHand).toBe(0)

    const duplicateSku = await request.post('/v1/admin/products', { headers: auth, data: {
      title: 'Duplicate SKU', slug: `duplicate-${suffix}`, sku: `head-${suffix}-blk`,
      priceMinor: 100, categoryIds: [childCat.id],
    } })
    expect(duplicateSku.status()).toBe(409)

    const publicRead = await request.get(`/v1/products/headphones-${suffix}`)
    expect(publicRead.status()).toBe(200)
    expect((await publicRead.json()).id).toBe(productId)
    const list = await request.get(`/v1/products?category=tech-${suffix}&page=1&limit=10`)
    expect(list.status()).toBe(200)
    expect((await list.json()).items.some((p: { id: string }) => p.id === productId)).toBe(true)

    const patchReplaceVariant = await request.patch(`/v1/admin/products/${productId}`, {
      headers: auth, data: { variants: [] },
    })
    expect(patchReplaceVariant.status()).toBe(400)

    const archive = await request.delete(`/v1/admin/products/${productId}`, { headers: auth })
    expect(archive.status()).toBe(200)
    expect((await archive.json()).status).toBe('ARCHIVED')
    const hidden = await request.get(`/v1/products/headphones-${suffix}`)
    expect(hidden.status()).toBe(404)

    await db.user.update({ where: { id: userId }, data: { role: 'STAFF' } })
    const staffLogin = await request.post('/v1/admin/auth/login', { data: { email, password } })
    expect(staffLogin.status()).toBe(200)
    const staffAuth = bearer((await staffLogin.json()).accessToken as string)
    const staffView = await request.get('/v1/admin/products', { headers: staffAuth })
    expect(staffView.status()).toBe(200)
    const staffEdit = await request.patch(`/v1/admin/products/${productId}`, {
      headers: staffAuth, data: { title: 'Do not allow' },
    })
    expect(staffEdit.status()).toBe(403)
  } finally {
    // Scoped cleanup: only UUIDs created in this test, never reset the database.
    try {
      if (productId) {
        await db.productVariant.deleteMany({ where: { productId } })
        await db.product.deleteMany({ where: { id: productId } })
      }
      for (const id of categories.reverse()) await db.category.deleteMany({ where: { id } })
      if (userId) {
        await db.auditEvent.deleteMany({ where: { actorId: userId } })
        await db.user.deleteMany({ where: { id: userId } })
      }
    } finally { await db.$disconnect() }
  }
})
