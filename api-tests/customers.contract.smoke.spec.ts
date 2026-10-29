import { expect, test } from '@playwright/test'

test('05A-3 OpenAPI: Customers / Admin has 2 protected, typed read operations', async ({
  request,
}) => {
  const result = await request.get('/docs-json')
  expect(result.status()).toBe(200)
  const doc = await result.json()
  for (const path of ['/v1/admin/customers', '/v1/admin/customers/{id}']) {
    const op = doc.paths[path]?.get
    expect(op, path).toBeDefined()
    expect(op.tags).toContain('Customers / Admin')
    expect(op.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    )
    expect(op.responses['200']).toBeDefined()
    expect(op.responses['403']).toBeDefined()
  }
  const params = doc.paths['/v1/admin/customers'].get.parameters
  for (const name of ['page', 'limit', 'search', 'status'])
    expect(params).toEqual(
      expect.arrayContaining([expect.objectContaining({ name, in: 'query' })]),
    )
  for (const name of [
    'AdminCustomersPageDto',
    'AdminCustomerDetailDto',
    'AdminCustomerRowDto',
  ])
    expect(doc.components.schemas).toHaveProperty(name)
  const list = doc.components.schemas.AdminCustomerRowDto.properties
  for (const forbidden of [
    'passwordHash',
    'sessions',
    'customerAddresses',
    'shippingAddress',
    'paymentTransaction',
  ])
    expect(list).not.toHaveProperty(forbidden)
})
