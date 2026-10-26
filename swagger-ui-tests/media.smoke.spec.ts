import { test, expect } from '@playwright/test'
import { openSwagger, swaggerExecute } from './swagger-helper'
test('03C Swagger media UI rejects unauthenticated upload before DB', async ({
  page,
}) => {
  await openSwagger(page)
  const response = await swaggerExecute(
    page,
    'POST',
    '/v1/admin/media/uploads',
    401,
    { mimeType: 'image/png', bytes: 1024 },
  )
  expect(response.status()).toBe(401)
})
