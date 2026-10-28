import { expect, test } from '@playwright/test'

test('04D-1 Swagger contract: admin fulfillment is permission-gated, customer order includes tracking', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const [method, path] of [
    ['get', '/v1/admin/orders'],
    ['get', '/v1/admin/orders/{id}'],
    ['post', '/v1/admin/orders/{id}/fulfillment/start'],
    ['post', '/v1/admin/orders/{id}/fulfillment/ship'],
    ['post', '/v1/admin/orders/{id}/fulfillment/deliver'],
  ] as const) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method} ${path}`).toBeDefined()
    expect(op.security).toEqual([{ 'access-token': [] }])
    expect(op.tags).toContain('Orders / Admin')
  }
  const order = doc.components.schemas.OrderResponseDto
  expect(order.properties).toHaveProperty('fulfillment')
  const shipOp = doc.paths['/v1/admin/orders/{id}/fulfillment/ship'].post
  const shipRef = shipOp.requestBody.content['application/json'].schema.$ref
  const shipSchema = doc.components.schemas[shipRef.split('/').pop()]
  expect(shipSchema.properties).toHaveProperty('requestId')
  expect(shipSchema.properties).toHaveProperty('carrier')
  expect(shipSchema.properties).toHaveProperty('trackingNumber')
  expect(shipSchema.properties).not.toHaveProperty('status')
  expect(shipSchema.properties).not.toHaveProperty('paidAt')
})
