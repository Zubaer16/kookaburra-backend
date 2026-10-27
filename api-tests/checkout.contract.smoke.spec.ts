import { expect, test } from '@playwright/test'

test('04B-1 Swagger: checkout estimates and owner rate configuration are JWT-only', async ({ request }) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  for (const [method, path, tag] of [
    ['post', '/v1/checkout/estimate', 'Checkout / Customer'],
    ['get', '/v1/admin/checkout/rates', 'Checkout / Admin'],
    ['put', '/v1/admin/checkout/rates', 'Checkout / Admin'],
  ]) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method} ${path}`).toBeDefined()
    expect(op.tags).toContain(tag)
    expect(op.security).toEqual(expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]))
  }
  const input = doc.components.schemas.CheckoutEstimateDto.properties
  expect(input).toHaveProperty('countryCode')
  const config = doc.components.schemas.PutCheckoutRateDto.properties
  for (const key of ['countryCode', 'currency', 'shippingMinor', 'freeOverSubtotalMinor', 'taxBps', 'enabled'])
    expect(config).toHaveProperty(key)
  const output = doc.components.schemas.CheckoutEstimateResponseDto.properties
  for (const key of ['estimatedTotalMinor', 'taxMinor', 'shippingMinor', 'reservationStatus', 'payable'])
    expect(output).toHaveProperty(key)
  expect((await request.post('/v1/checkout/estimate', { data: { countryCode: 'US' } })).status()).toBe(401)
  expect((await request.put('/v1/admin/checkout/rates', { data: {} })).status()).toBe(401)
})
