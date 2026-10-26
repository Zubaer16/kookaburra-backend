import { expect, test } from '@playwright/test'

test('A2 OpenAPI contract documents frontend alignment metadata, catalog filtering and inventory identity lookup', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const schemas = doc.components.schemas
  for (const key of ['color', 'sortOrder', 'active'])
    expect(schemas.CreateCategoryDto.properties).toHaveProperty(key)
  for (const key of ['badge', 'tag'])
    expect(schemas.CreateProductDto.properties).toHaveProperty(key)
  const productQuery = doc.paths['/v1/products'].get.parameters
  for (const key of [
    'tag',
    'sort',
    'inStock',
    'minPriceMinor',
    'maxPriceMinor',
  ])
    expect(productQuery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: key, in: 'query' }),
      ]),
    )
  const inventoryQuery = doc.paths['/v1/admin/inventory'].get.parameters
  for (const key of ['productId', 'variantId'])
    expect(inventoryQuery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: key, in: 'query' }),
      ]),
    )
  expect(doc.paths['/v1/admin/inventory'].get.security).toEqual(
    expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
  )
})
