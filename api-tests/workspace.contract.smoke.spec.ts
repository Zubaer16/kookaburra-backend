import { expect, test } from '@playwright/test'
test('A1: workspace Swagger contract documents request DTO, error responses, and JWT', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const [method, path] of [
    ['get', '/v1/admin/roles'],
    ['patch', '/v1/admin/roles/{key}/permissions'],
    ['get', '/v1/admin/staff'],
    ['post', '/v1/admin/staff'],
    ['patch', '/v1/admin/staff/{id}'],
  ] as const) {
    const spec = doc.paths[path][method]
    expect(spec.tags).toContain('Workspace / Admin')
    expect(spec.security).toEqual(
      expect.arrayContaining([{ 'access-token': [] }]),
    )
    expect(spec.responses['401']).toBeDefined()
    expect(spec.responses['403']).toBeDefined()
    if (method === 'post' || method === 'patch') {
      expect(spec.requestBody.content['application/json'].schema).toBeDefined()
    }
  }
  const schemas = doc.components.schemas
  expect(schemas.StaffCreateDto.properties).toHaveProperty('password')
  expect(schemas.StaffCreateDto.properties.role.enum).not.toContain('OWNER')
  expect(schemas.RolePermissionUpdateDto.properties.permissions.type).toBe(
    'array',
  )
})
