import { expect, test } from '@playwright/test'

/** These requests must fail before opening a database connection. */
test('Catalog DTO and route guards reject invalid requests without PostgreSQL', async ({
  request,
}) => {
  const invalidProduct = await request.post('/v1/admin/products', {
    data: { title: '', priceMinor: -1 },
  })
  // Missing bearer is denied before DTO validation.
  expect(invalidProduct.status()).toBe(401)
  const publicCases = [
    '/v1/products?page=0',
    '/v1/products?limit=101',
    '/v1/products?status=INVALID',
    '/v1/products?category=invalid_slug',
  ]
  for (const path of publicCases) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(400)
    expect(JSON.stringify(await response.json())).not.toMatch(
      /PrismaClient|DATABASE_URL|stack/i,
    )
  }
})
