import { expect, test } from '@playwright/test'

test('04C-2B1 contract: verified Stripe settlement has no customer-controlled capture or paid-status endpoint', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  expect(
    doc.components.schemas.OrderResponseDto.properties.status.enum,
  ).toContain('PAID')
  expect(doc.components.schemas.OrderResponseDto.properties).toHaveProperty(
    'paidAt',
  )
  expect(
    doc.components.schemas.PaymentPreparationResponseDto.properties
      .preparationStatus.enum,
  ).toContain('SETTLED')
  for (const path of [
    '/v1/payments/settle',
    '/v1/payments/orders/{orderId}/confirm',
    '/v1/payments/orders/{orderId}/capture',
  ])
    expect(doc.paths[path]).toBeUndefined()
  const webhook = doc.paths['/v1/payments/stripe/webhook'].post
  expect(webhook.security ?? []).toEqual([])
  const props = doc.components.schemas.PaymentPreparationResponseDto.properties
  expect(props).not.toHaveProperty('clientSecret')
  expect(props).not.toHaveProperty('client_secret')
})
