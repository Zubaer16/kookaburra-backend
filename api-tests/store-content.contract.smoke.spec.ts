import { expect, test } from '@playwright/test'

test('05B-2 OpenAPI: public and OWNER content, strict revision, safe schemas', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  const pub = doc.paths['/v1/store/content']?.get
  expect(pub?.tags).toEqual(['Store Content / Public'])
  expect(pub?.security || []).toEqual([])
  expect(pub?.responses['200']).toBeDefined()
  const get = doc.paths['/v1/admin/store/content']?.get
  const put = doc.paths['/v1/admin/store/content']?.put
  for (const op of [get, put]) {
    expect(op?.tags).toEqual(['Store Content / Admin'])
    expect(op?.security).toEqual([{ 'access-token': [] }])
    expect(op?.responses['200']).toBeDefined()
  }
  expect(put.responses['400']).toBeDefined()
  expect(put.responses['409']).toBeDefined()
  expect(
    Object.keys(doc.components.schemas.PutStoreContentDto.properties).sort(),
  ).toEqual(
    [
      'expectedRevision',
      'seoTitle',
      'seoDescription',
      'footerText',
      'privacyPolicy',
      'termsOfService',
      'returnPolicy',
    ].sort(),
  )
  expect(
    doc.components.schemas.PublicStoreContentDto.properties,
  ).not.toHaveProperty('revision')
  expect((await request.get('/v1/admin/store/content')).status()).toBe(401)
  expect(
    (await request.put('/v1/admin/store/content', { data: {} })).status(),
  ).toBe(401)
})
