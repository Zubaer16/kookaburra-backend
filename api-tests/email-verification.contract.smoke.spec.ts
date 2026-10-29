import { expect, test } from '@playwright/test'

test('05A-5 OpenAPI: request is JWT protected, confirmation accepts one-time token', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  const requestOperation =
    doc.paths['/v1/auth/email-verification/request']?.post
  const confirmOperation =
    doc.paths['/v1/auth/email-verification/confirm']?.post
  expect(requestOperation).toBeDefined()
  expect(confirmOperation).toBeDefined()
  expect(requestOperation.tags).toContain('Authentication / Customer')
  expect(requestOperation.security).toEqual(
    expect.arrayContaining([{ 'access-token': [] }]),
  )
  expect(requestOperation.responses['202']).toBeDefined()
  expect(confirmOperation.responses['200']).toBeDefined()
  expect(confirmOperation.security || []).not.toEqual(
    expect.arrayContaining([{ 'access-token': [] }]),
  )
  const dto = doc.components.schemas.EmailVerificationConfirmDto
  expect(dto.required).toContain('token')
  expect(dto.properties.token.writeOnly).toBe(true)
  expect(dto.properties).not.toHaveProperty('email')
  const profile = doc.components.schemas.CustomerProfileDto
  expect(profile.properties).toHaveProperty('emailVerified')
})
