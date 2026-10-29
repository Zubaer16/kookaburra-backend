import { expect, test } from '@playwright/test'

const endpoints = [
  ['get', '/v1/account/profile', '200'],
  ['patch', '/v1/account/profile', '200'],
  ['get', '/v1/account/addresses', '200'],
  ['get', '/v1/account/addresses/{addressId}', '200'],
  ['post', '/v1/account/addresses', '201'],
  ['patch', '/v1/account/addresses/{addressId}', '200'],
  ['delete', '/v1/account/addresses/{addressId}', '200'],
] as const

test('05A-2 OpenAPI: account endpoints protected, tagged, typed', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  for (const [method, path, code] of endpoints) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method} ${path}`).toBeDefined()
    expect(op.tags).toContain('Account / Customer')
    expect(op.security).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    )
    expect(op.responses[code]).toBeDefined()
  }
  const profile = doc.components.schemas.UpdateCustomerProfileDto
  expect(profile.properties).toHaveProperty('displayName')
  expect(profile.properties).not.toHaveProperty('role')
  expect(
    doc.components.schemas.CustomerAddressInputDto.properties,
  ).toHaveProperty('countryCode')
})
