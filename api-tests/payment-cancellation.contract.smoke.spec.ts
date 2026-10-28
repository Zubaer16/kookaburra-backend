import { expect, test } from '@playwright/test'

test('04C-2B2A contract: cancelled provider intents remain operator-only, no capture/refund endpoint', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const props = doc.components.schemas.PaymentPreparationResponseDto.properties
  expect(props.preparationStatus.enum).toEqual(
    expect.arrayContaining(['CANCELLING', 'CANCELLED']),
  )
  expect(props).not.toHaveProperty('clientSecret')
  expect(props).toHaveProperty('canConfirm')
  expect(props).toHaveProperty('payable')
  for (const route of [
    '/v1/payments/orders/{orderId}/cancel-intent',
    '/v1/payments/orders/{orderId}/capture',
    '/v1/payments/orders/{orderId}/refund',
  ])
    expect(doc.paths[route]).toBeUndefined()
})
