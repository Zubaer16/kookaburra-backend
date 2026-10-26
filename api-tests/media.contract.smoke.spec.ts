import { expect, test } from '@playwright/test'
const operations = [
  ['post', '/v1/admin/media/uploads'],
  ['post', '/v1/admin/media/{id}/complete'],
  ['get', '/v1/admin/media/{id}'],
  ['delete', '/v1/admin/media/{id}'],
  ['put', '/v1/admin/products/{id}/media'],
  ['get', '/v1/admin/media-deletion-jobs'],
  ['post', '/v1/admin/media-deletion-jobs/{id}/retry'],
] as const

test('03C OpenAPI documents media/gallery JWT-only operations', async ({
  request,
}) => {
  const doc = await (await request.get('/docs-json')).json()
  expect(doc.tags.map((x: { name: string }) => x.name)).toContain(
    'Media / Admin',
  )
  for (const [method, path] of operations) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method} ${path}`).toBeDefined()
    expect(op.tags).toContain('Media / Admin')
    expect(op.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    )
    expect(Object.keys(op.responses ?? {}).length).toBeGreaterThan(0)
  }
  expect(doc.components.schemas).toHaveProperty('StartMediaUploadDto')
  expect(doc.components.schemas).toHaveProperty('ReplaceProductGalleryDto')
  const upload = doc.components.schemas.MediaUploadInstructionDto.properties
  expect(upload).toHaveProperty('method')
  expect(upload).toHaveProperty('headers')
  const products = doc.components.schemas.CatalogProductResponseDto.properties
  for (const field of ['image', 'gallery', 'images'])
    expect(products).toHaveProperty(field)
})
