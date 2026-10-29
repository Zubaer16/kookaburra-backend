import { expect, test } from '@playwright/test'

test('04D-2B-3 Swagger contract: admin cancel only unpaid order, no refund or input body', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  const op = doc.paths['/v1/admin/orders/{id}/cancel']?.post
  expect(op).toBeDefined()
  expect(op.tags).toContain('Orders / Admin')
  expect(op.security).toEqual([{ 'access-token': [] }])
  expect(op.requestBody).toBeUndefined()
  expect(op.parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]),
  )
  expect(op.responses['200'].content['application/json'].schema.$ref).toContain(
    'OrderResponseDto',
  )
  expect(op.responses).toHaveProperty('409')
  expect(op.responses).toHaveProperty('404')
  expect(op.summary).toMatch(/unpaid order/i)
})
