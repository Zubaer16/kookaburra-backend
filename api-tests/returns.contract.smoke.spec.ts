import { expect, test } from '@playwright/test'

test('04D-2A Swagger contract: JWT-protected return inspection and no refund endpoints', async ({
  request,
}) => {
  const response = await request.get('/docs-json')
  expect(response.status()).toBe(200)
  const doc = await response.json()
  for (const [method, path, tag] of [
    ['post', '/v1/orders/{id}/returns', 'Returns / Customer'],
    ['get', '/v1/orders/{id}/returns', 'Returns / Customer'],
    ['get', '/v1/admin/orders/{id}/returns', 'Returns / Admin'],
    ...['approve', 'reject', 'receive', 'restock'].map((a) => [
      'post',
      `/v1/admin/orders/{id}/returns/{returnId}/${a}`,
      'Returns / Admin',
    ]),
  ] as string[][]) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method.toUpperCase()} ${path}`).toBeDefined()
    expect(op.tags).toContain(tag)
    expect(op.security).toEqual([{ 'access-token': [] }])
  }
  for (const [method, path, tag] of [
    ['get', '/v1/orders/{id}/replacements', 'Replacements / Customer'],
    ['get', '/v1/admin/orders/{id}/replacements', 'Replacements / Admin'],
    [
      'post',
      '/v1/admin/orders/{id}/replacements/returns/{returnId}/authorize',
      'Replacements / Admin',
    ],
    ...['ship', 'deliver', 'cancel'].map((action) => [
      'post',
      `/v1/admin/orders/{id}/replacements/{replacementId}/${action}`,
      'Replacements / Admin',
    ]),
  ] as string[][]) {
    const operation = doc.paths[path]?.[method]
    expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined()
    expect(operation.tags).toContain(tag)
    expect(operation.security).toEqual([{ 'access-token': [] }])
  }
  expect(
    Object.keys(doc.components.schemas.ReplacementActionDto.properties),
  ).toEqual(['requestId'])
  expect(
    Object.keys(doc.components.schemas.ShipReplacementDto.properties).sort(),
  ).toEqual(['carrier', 'requestId', 'trackingNumber'])
  expect(
    doc.components.schemas.ReplacementResponseDto.properties,
  ).toHaveProperty('status')
  const requestDto = doc.components.schemas.CreateOrderReturnDto.properties
  expect(Object.keys(requestDto).sort()).toEqual([
    'orderLineId',
    'quantity',
    'reason',
    'requestId',
  ])
  for (const excluded of [
    'status',
    'paidAt',
    'stockOnHand',
    'refundAmount',
    'refundStatus',
  ])
    expect(requestDto).not.toHaveProperty(excluded)
  expect(doc.components.schemas.OrderLineResponseDto.properties).toHaveProperty(
    'id',
  )
  expect(
    doc.components.schemas.OrderReturnResponseDto.properties,
  ).toHaveProperty('status')
})
