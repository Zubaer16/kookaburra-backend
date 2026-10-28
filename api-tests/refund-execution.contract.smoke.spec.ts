import { expect, test } from '@playwright/test'

test('04C-2B2C2 refund execution: no public mutation endpoint, existing owner/customer contract retained', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const owner = doc.paths['/v1/admin/payments/orders/{orderId}/refunds']
  const customer = doc.paths['/v1/payments/orders/{orderId}/refunds']
  expect(owner.post.security).toEqual([{ 'access-token': [] }])
  expect(customer.get.security).toEqual([{ 'access-token': [] }])
  expect(doc.paths['/v1/payments/refunds/execute']).toBeUndefined()
  expect(doc.paths['/v1/admin/payments/refunds/execute']).toBeUndefined()
  expect(
    doc.components.schemas.RefundRequestResponseDto.properties,
  ).toHaveProperty('providerRefundSubmitted')
  expect(
    doc.components.schemas.RefundRequestResponseDto.properties,
  ).toHaveProperty('stockReturned')
})
