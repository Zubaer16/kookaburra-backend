import { expect, test } from '@playwright/test'

test('04C-2B2B TEST-only card completion documented without raw card or settlement manipulation', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const endpoint = doc.paths['/v1/payments/orders/{orderId}/test-complete'].post
  expect(endpoint.security).toEqual([{ 'access-token': [] }])
  expect(endpoint.requestBody).toBeUndefined()
  const props = doc.components.schemas.TestCardCompletionResponseDto.properties
  expect(props).toHaveProperty('settlementPending')
  expect(props).not.toHaveProperty('clientSecret')
  expect(doc.paths['/v1/payments/orders/{orderId}/refund']).toBeUndefined()
})
