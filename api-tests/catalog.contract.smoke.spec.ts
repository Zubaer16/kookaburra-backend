import { expect, test } from '@playwright/test'

type Operation = {
  tags?: string[]
  security?: Array<Record<string, string[]>>
  parameters?: Array<{ name: string; in: string }>
  requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> }
  responses?: Record<string, unknown>
}
type OpenApiDocument = {
  openapi: string
  paths: Record<
    string,
    Partial<Record<'get' | 'post' | 'patch' | 'delete', Operation>>
  >
  components?: {
    schemas?: Record<string, unknown>
    securitySchemes?: Record<string, unknown>
  }
}

const inventory: Array<
  [string, 'get' | 'post' | 'patch' | 'delete', string, boolean]
> = [
  ['/v1/categories', 'get', 'Catalog / Storefront', false],
  ['/v1/products', 'get', 'Catalog / Storefront', false],
  ['/v1/products/{slug}', 'get', 'Catalog / Storefront', false],
  ['/v1/admin/categories', 'get', 'Catalog / Admin', true],
  ['/v1/admin/categories', 'post', 'Catalog / Admin', true],
  ['/v1/admin/categories/{id}', 'patch', 'Catalog / Admin', true],
  ['/v1/admin/categories/{id}', 'delete', 'Catalog / Admin', true],
  ['/v1/admin/products', 'get', 'Catalog / Admin', true],
  ['/v1/admin/products', 'post', 'Catalog / Admin', true],
  ['/v1/admin/products/{id}', 'get', 'Catalog / Admin', true],
  ['/v1/admin/products/{id}', 'patch', 'Catalog / Admin', true],
  ['/v1/admin/products/{id}', 'delete', 'Catalog / Admin', true],
  ['/v1/admin/products/{id}/variants', 'post', 'Catalog / Admin', true],
  [
    '/v1/admin/products/{id}/variants/{variantId}',
    'patch',
    'Catalog / Admin',
    true,
  ],
  [
    '/v1/admin/products/{id}/variants/{variantId}',
    'delete',
    'Catalog / Admin',
    true,
  ],
]

test('OpenAPI exposes all 15 Phase 03A Catalog operations, security and payload contracts', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = (await response.json()) as OpenApiDocument
  expect(doc.openapi).toMatch(/^3\./)
  expect(doc.components?.securitySchemes).toHaveProperty('access-token')

  for (const [path, method, tag, protectedRoute] of inventory) {
    const operation = doc.paths[path]?.[method]
    expect(
      operation,
      `${method.toUpperCase()} ${path} must exist`,
    ).toBeDefined()
    expect(operation?.tags).toContain(tag)
    if (protectedRoute) {
      expect(
        operation?.security,
        `${method} ${path} must require bearer auth`,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'access-token': [] }),
        ]),
      )
    } else {
      expect(operation?.security ?? []).toEqual([])
    }
    expect(Object.keys(operation?.responses ?? {}).length).toBeGreaterThan(0)
    for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    )) {
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ name, in: 'path' })]),
      )
    }
  }

  const listParams = doc.paths['/v1/products']?.get?.parameters ?? []
  for (const name of ['page', 'limit', 'category', 'search']) {
    expect(listParams).toEqual(
      expect.arrayContaining([expect.objectContaining({ name, in: 'query' })]),
    )
  }
  const schemas = doc.components?.schemas ?? {}
  for (const schema of [
    'CreateCategoryDto',
    'CreateProductDto',
    'CreateVariantDto',
    'UpdateCategoryDto',
    'UpdateProductDto',
    'UpdateVariantDto',
  ]) {
    expect(schemas).toHaveProperty(schema)
  }
  for (const [path, method, schema] of [
    ['/v1/admin/categories', 'post', 'CreateCategoryDto'],
    ['/v1/admin/products', 'post', 'CreateProductDto'],
    ['/v1/admin/products/{id}/variants', 'post', 'CreateVariantDto'],
    ['/v1/admin/products/{id}', 'patch', 'UpdateProductDto'],
  ] as const) {
    expect(
      doc.paths[path]?.[method]?.requestBody?.content?.['application/json']
        ?.schema?.$ref,
    ).toBe(`#/components/schemas/${schema}`)
  }
})
