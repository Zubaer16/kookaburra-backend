import { expect, test } from '@playwright/test'

test('04C-2B2C1 refund request ledger OpenAPI: OWNER-only, amount safety, no provider refund endpoint', async ({
  request,
}) => {
  const r = await request.get('/docs-json')
  expect(r.status()).toBe(200)
  const doc = await r.json()
  const admin = doc.paths['/v1/admin/payments/orders/{orderId}/refunds']
  const customer = doc.paths['/v1/payments/orders/{orderId}/refunds']
  expect(admin.post.security).toEqual([{ 'access-token': [] }])
  expect(admin.get.security).toEqual([{ 'access-token': [] }])
  expect(customer.get.security).toEqual([{ 'access-token': [] }])
  expect(admin.post.tags).toContain('Payments / Admin')
  const bodyRef = admin.post.requestBody.content['application/json'].schema.$ref
  const schema = doc.components.schemas[bodyRef.split('/').pop()]
  expect(schema.properties).toHaveProperty('amountMinor')
  expect(schema.properties).toHaveProperty('requestId')
  expect(schema.properties).toHaveProperty('reason')
  expect(schema.properties).not.toHaveProperty('status')
  expect(schema.properties).not.toHaveProperty('providerRefundId')
  expect(
    doc.components.schemas.RefundRequestResponseDto.properties,
  ).toHaveProperty('providerRefundSubmitted')
  expect(doc.paths['/v1/payments/orders/{orderId}/refund']).toBeUndefined()
})
