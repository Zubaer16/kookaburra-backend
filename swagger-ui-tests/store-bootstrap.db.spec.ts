import { expect, test } from '@playwright/test'
import { openSwagger, swaggerExecute } from './swagger-helper'

test('05B-4 Swagger Chromium: public store bootstrap Try it out Execute', async ({
  page,
}) => {
  await openSwagger(page)
  const result = await swaggerExecute(page, 'GET', '/v1/store/bootstrap', 200)
  const body = await result.json()
  expect(body.schemaVersion).toBe(1)
  expect(Object.keys(body).sort()).toEqual([
    'branding',
    'content',
    'profile',
    'schemaVersion',
  ])
  expect(typeof body.branding.configured).toBe('boolean')
  expect(typeof body.profile.configured).toBe('boolean')
  expect(typeof body.content.configured).toBe('boolean')
  expect(JSON.stringify(body)).not.toMatch(/revision|providerAssetId|updatedAt/)
  await swaggerExecute(page, 'GET', '/v1/admin/store/branding', 401)
})
