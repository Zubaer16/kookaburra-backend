import { expect, test } from '@playwright/test'

const operations = [
  ['get', '/v1/cart'],
  ['get', '/v1/cart/quote'],
  ['put', '/v1/cart/items'],
  ['delete', '/v1/cart/items/{id}'],
  ['delete', '/v1/cart'],
] as const

test('04A OpenAPI: all customer cart routes require JWT and expose DTO schemas', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const [method, path] of operations) {
    const operation = doc.paths[path]?.[method]
    expect(operation, `${method} ${path}`).toBeDefined()
    expect(operation.tags).toContain('Cart / Customer')
    expect(operation.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    )
    expect(Object.keys(operation.responses ?? {}).length).toBeGreaterThan(0)
  }
  const input = doc.components.schemas.SetCartItemDto.properties
  expect(input).toHaveProperty('productId')
  expect(input).toHaveProperty('variantId')
  expect(input).toHaveProperty('quantity')
  const quote = doc.components.schemas.CartQuoteResponseDto.properties
  for (const key of [
    'cartId',
    'items',
    'currency',
    'subtotalMinor',
    'amountDueMinor',
    'checkoutReady',
    'issues',
  ])
    expect(quote).toHaveProperty(key)
})
