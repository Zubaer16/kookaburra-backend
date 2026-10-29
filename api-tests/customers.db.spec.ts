import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { CatalogTestFixture, bearer } from './catalog-test-support'

test('05A-3 DB: directory search/status/page/detail project only customer rows', async ({ request }) => {
  const f = new CatalogTestFixture(request)
  try {
    const owner = await f.account('OWNER')
    const first = await f.account('CUSTOMER')
    const second = await f.account('CUSTOMER')
    const otherStaff = await f.account('STAFF')
    await f.db.user.update({ where: { id: first.id }, data: { displayName: 'Lighthouse Test Customer' } })
    await f.db.user.update({ where: { id: second.id }, data: { displayName: 'Other Buyer', status: 'DISABLED' } })
    const headers = bearer(owner.token)
    const filtered = await request.get('/v1/admin/customers', {
      headers, params: { search: 'LIGHTHOUSE TEST CUSTOMER', page: 1, limit: 5 },
    })
    expect(filtered.status()).toBe(200)
    const found = await filtered.json()
    expect(found.total).toBe(1)
    expect(found.items).toHaveLength(1)
    expect(found.items[0]).toMatchObject({ id: first.id, orderCount: 0, lastOrderAt: null })
    expect(found.items[0]).not.toHaveProperty('passwordHash')
    expect(found.items[0]).not.toHaveProperty('customerAddresses')
    const emailSearch = await request.get('/v1/admin/customers', { headers, params: { search: first.email.toUpperCase() } })
    expect((await emailSearch.json()).items[0].id).toBe(first.id)
    const disabled = await request.get('/v1/admin/customers', { headers, params: { search: second.email, status: 'DISABLED' } })
    expect(disabled.status()).toBe(200)
    expect((await disabled.json()).items[0].id).toBe(second.id)
    const excluded = await request.get('/v1/admin/customers', { headers, params: { search: first.email, status: 'DISABLED' } })
    expect((await excluded.json()).total).toBe(0)
    const detail = await request.get(`/v1/admin/customers/${first.id}`, { headers })
    expect(detail.status()).toBe(200)
    expect(await detail.json()).toMatchObject({ id: first.id, orderCount: 0, savedAddressCount: 0, recentOrders: [] })
    const staffDetail = await request.get(`/v1/admin/customers/${otherStaff.id}`, { headers })
    expect(staffDetail.status()).toBe(404)
    const missing = await request.get(`/v1/admin/customers/${randomUUID()}`, { headers })
    expect(missing.status()).toBe(404)
    // A stable, fixture-specific query validates page > 1 without importing fixture IDs.
    const fixturePage1 = await request.get('/v1/admin/customers', { headers, params: { search: 'catalog-' + f.key, limit: 1, page: 1 } })
    const fixturePage2 = await request.get('/v1/admin/customers', { headers, params: { search: 'catalog-' + f.key, limit: 1, page: 2 } })
    const page1 = await fixturePage1.json()
    const page2 = await fixturePage2.json()
    expect(page1.total).toBe(2)
    expect(page2.total).toBe(2)
    expect(page1.items).toHaveLength(1)
    expect(page2.items).toHaveLength(1)
    expect(page1.items[0].id).not.toBe(page2.items[0].id)
  } finally {
    await f.close()
  }
})
