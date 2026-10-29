import { expect, test } from '@playwright/test'

test('05A-6 OpenAPI: anonymous recovery, non-enumerating DTOs and password secrecy', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const requested = doc.paths['/v1/auth/password-reset/request']?.post
  const completed = doc.paths['/v1/auth/password-reset/confirm']?.post
  expect(requested).toBeDefined()
  expect(completed).toBeDefined()
  expect(requested.tags).toContain('Authentication / Customer')
  expect(requested.responses['202']).toBeDefined()
  expect(requested.security || []).toEqual([])
  expect(completed.responses['200']).toBeDefined()
  expect(completed.security || []).toEqual([])
  expect(doc.components.schemas.PasswordResetRequestDto.required).toContain(
    'email',
  )
  expect(
    doc.components.schemas.PasswordResetRequestResultDto.properties,
  ).not.toHaveProperty('token')
  const confirm = doc.components.schemas.PasswordResetConfirmDto
  expect(confirm.required).toEqual(
    expect.arrayContaining(['token', 'newPassword']),
  )
  expect(confirm.properties.token.writeOnly).toBe(true)
  expect(confirm.properties.newPassword.writeOnly).toBe(true)
})
