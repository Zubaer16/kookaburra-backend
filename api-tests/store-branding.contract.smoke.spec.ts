import { expect, test } from '@playwright/test'

test('05B-3 OpenAPI: media-backed branding has separate public and OWNER-only contracts', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  const pub = doc.paths['/v1/store/branding']?.get
  expect(pub?.tags).toEqual(['Store Branding / Public'])
  expect(pub?.security || []).toEqual([])
  expect(pub?.responses['200']).toBeDefined()
  for (const method of ['get', 'put']) {
    const op = doc.paths['/v1/admin/store/branding']?.[method]
    expect(op?.tags).toEqual(['Store Branding / Admin'])
    expect(op?.security).toEqual([{ 'access-token': [] }])
    expect(op?.responses['200']).toBeDefined()
  }
  const put = doc.paths['/v1/admin/store/branding']?.put
  expect(put?.responses['400']).toBeDefined()
  expect(put?.responses['409']).toBeDefined()
  expect(
    Object.keys(doc.components.schemas.PutStoreBrandingDto.properties).sort(),
  ).toEqual(['expectedRevision', 'faviconMediaId', 'logoMediaId'])
  expect(
    doc.components.schemas.PublicStoreBrandingDto.properties,
  ).not.toHaveProperty('revision')
  expect((await request.get('/v1/admin/store/branding')).status()).toBe(401)
})
