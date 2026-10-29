import { expect, test } from '@playwright/test'

test('05A-4 OpenAPI: change-password requires customer bearer and strongly typed secret fields', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const operation = doc.paths['/v1/auth/change-password']?.post
  expect(operation).toBeDefined()
  expect(operation.tags).toContain('Authentication / Customer')
  expect(operation.security).toEqual(
    expect.arrayContaining([{ 'access-token': [] }]),
  )
  expect(operation.responses['200']).toBeDefined()
  const dto = doc.components.schemas.ChangePasswordDto
  expect(dto.required).toEqual(
    expect.arrayContaining(['currentPassword', 'newPassword']),
  )
  for (const field of ['currentPassword', 'newPassword']) {
    expect(dto.properties[field].writeOnly).toBe(true)
    expect(dto.properties[field].minLength).toBe(12)
  }
  expect(dto.properties).not.toHaveProperty('role')
})
