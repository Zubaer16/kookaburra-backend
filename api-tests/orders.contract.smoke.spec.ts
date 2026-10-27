import { expect, test } from '@playwright/test'

test('04C-1 Swagger exposes JWT-only unpaid orders with server prices', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const [method, path] of [
    ['post', '/v1/orders'],
    ['get', '/v1/orders'],
    ['get', '/v1/orders/{id}'],
    ['post', '/v1/orders/{id}/cancel'],
  ]) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method.toUpperCase()} ${path}`).toBeDefined()
    expect(op.tags).toContain('Orders / Customer')
    expect(op.security).toEqual(
      expect.arrayContaining([{ 'access-token': [] }]),
    )
  }
  const body = doc.components.schemas.CreateOrderDto
  expect(body.required).toEqual(
    expect.arrayContaining(['reservationId', 'requestId', 'shippingAddress']),
  )
  expect(Object.keys(body.properties).sort()).toEqual([
    'requestId',
    'reservationId',
    'shippingAddress',
  ])
  const address = doc.components.schemas.OrderShippingAddressDto.properties
  for (const field of [
    'recipientName',
    'phone',
    'addressLine1',
    'city',
    'countryCode',
  ])
    expect(address).toHaveProperty(field)
  const out = doc.components.schemas.OrderResponseDto.properties
  for (const key of [
    'totalMinor',
    'currency',
    'lines',
    'paymentDeadlineAt',
    'payable',
    'shippingAddress',
  ])
    expect(out).toHaveProperty(key)
  expect((await request.post('/v1/orders', { data: {} })).status()).toBe(401)
})
