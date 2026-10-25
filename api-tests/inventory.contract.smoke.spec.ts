import { expect, test } from '@playwright/test'

test('Phase 03B OpenAPI contract exposes five secured inventory operations and schemas', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const spec = (await response.json()) as {
    paths: Record<
      string,
      Record<
        string,
        {
          tags: string[]
          security?: Array<Record<string, unknown>>
          requestBody?: unknown
          parameters?: unknown[]
        }
      >
    >
    components: {
      schemas: Record<
        string,
        { properties?: Record<string, unknown>; required?: string[] }
      >
    }
  }
  const methods = [
    ['get', '/v1/admin/inventory'],
    ['get', '/v1/admin/inventory/{id}'],
    ['get', '/v1/admin/inventory/{id}/movements'],
    ['patch', '/v1/admin/inventory/{id}/threshold'],
    ['post', '/v1/admin/inventory/{id}/adjustments'],
  ] as const
  for (const [method, path] of methods) {
    const operation = spec.paths[path]?.[method]
    expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined()
    expect(operation?.tags).toContain('Inventory / Admin')
    expect(operation?.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    )
  }
  const adjust = spec.components.schemas.AdjustInventoryDto
  for (const key of ['requestId', 'delta', 'reason']) {
    expect(adjust?.properties).toHaveProperty(key)
    expect(adjust?.required).toContain(key)
  }
  expect(
    spec.components.schemas.SetLowStockThresholdDto?.properties,
  ).toHaveProperty('lowStockThreshold')
  expect(
    spec.components.schemas.UpdateProductDto?.properties,
  ).not.toHaveProperty('stockOnHand')
  expect(
    spec.components.schemas.UpdateProductDto?.properties,
  ).not.toHaveProperty('variants')
  expect(
    spec.components.schemas.UpdateVariantDto?.properties,
  ).not.toHaveProperty('stockOnHand')
})
