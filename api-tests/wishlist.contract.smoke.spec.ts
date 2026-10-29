import { expect, test } from '@playwright/test'

const endpoints = [
  ['get', '/v1/wishlist'],
  ['post', '/v1/wishlist/merge'],
  ['put', '/v1/wishlist/{productId}'],
  ['delete', '/v1/wishlist/{productId}'],
] as const

test('05A-1 OpenAPI: private wishlist routes and strict merge schema', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const document = await response.json()
  for (const [method, endpoint] of endpoints) {
    const operation = document.paths[endpoint]?.[method]
    expect(operation, `${method} ${endpoint}`).toBeDefined()
    expect(operation.tags).toContain('Wishlist / Customer')
    expect(operation.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    )
    expect(operation.responses['200']).toBeDefined()
  }
  const merge = document.components.schemas.WishlistMergeDto.properties
  expect(merge).toHaveProperty('productIds')
  const responseDto = document.components.schemas.WishlistResponseDto.properties
  expect(responseDto).toHaveProperty('items')
  expect(responseDto).toHaveProperty('count')
})
