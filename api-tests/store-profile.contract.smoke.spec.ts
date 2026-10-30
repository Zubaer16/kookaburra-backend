import { expect, test } from '@playwright/test'

test('05B-1 OpenAPI: public safe projection and OWNER protected write', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  const publicGet = doc.paths['/v1/store/profile']?.get
  const adminGet = doc.paths['/v1/admin/store/profile']?.get
  const adminPut = doc.paths['/v1/admin/store/profile']?.put
  expect(publicGet?.tags).toEqual(['Store Profile / Public'])
  expect(publicGet?.security || []).toEqual([])
  expect(publicGet?.responses['200']).toBeDefined()
  for (const op of [adminGet, adminPut]) {
    expect(op?.tags).toEqual(['Store Profile / Admin'])
    expect(op?.security).toEqual([{ 'access-token': [] }])
    expect(op?.responses['200']).toBeDefined()
  }
  expect(adminPut.responses['400']).toBeDefined()
  const safe = doc.components.schemas.PutStoreProfileDto.properties
  expect(Object.keys(safe).sort()).toEqual(
    [
      'storeName',
      'supportEmail',
      'supportNotice',
      'timezone',
      'websiteUrl',
    ].sort(),
  )
  expect(safe).not.toHaveProperty('orderPrefix')
  expect(safe).not.toHaveProperty('role')
  expect(
    doc.components.schemas.PublicStoreProfileDto.properties,
  ).not.toHaveProperty('updatedAt')
  expect((await request.get('/v1/admin/store/profile')).status()).toBe(401)
  expect(
    (await request.put('/v1/admin/store/profile', { data: {} })).status(),
  ).toBe(401)
})
