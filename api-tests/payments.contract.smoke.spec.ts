import { expect, test } from '@playwright/test'

test('04C-2A Swagger: test-only preparation, signed public receipt and no payability', async ({ request }) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const [method, path] of [
    ['post', '/v1/payments/orders/{orderId}/prepare'],
    ['get', '/v1/payments/orders/{orderId}'],
  ]) {
    const op = doc.paths[path]?.[method]
    expect(op).toBeDefined()
    expect(op.tags).toContain('Payments / Customer')
    expect(op.security).toEqual(expect.arrayContaining([{ 'access-token': [] }]))
  }
  const webhook = doc.paths['/v1/payments/stripe/webhook']?.post
  expect(webhook?.tags).toContain('Payments / Webhooks')
  expect(webhook?.security ?? []).toEqual([])
  const props = doc.components.schemas.PaymentPreparationResponseDto.properties
  for (const item of ['orderId', 'providerIntentId', 'preparationStatus', 'amountMinor', 'currency', 'canConfirm', 'payable'])
    expect(props).toHaveProperty(item)
  expect(props).not.toHaveProperty('clientSecret')
  expect(props).not.toHaveProperty('client_secret')
  expect((await request.post('/v1/payments/orders/00000000-0000-4000-8000-000000000000/prepare')).status()).toBe(401)
})
