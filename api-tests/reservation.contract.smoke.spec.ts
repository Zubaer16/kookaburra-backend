import { expect, test } from '@playwright/test'

test('04B-2 OpenAPI exposes customer JWT-only stock holds and no payable promise', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  for (const [method, path] of [
    ['post', '/v1/checkout/reservations'],
    ['get', '/v1/checkout/reservations/{id}'],
    ['delete', '/v1/checkout/reservations/{id}'],
  ]) {
    const op = doc.paths[path]?.[method]
    expect(op, `${method} ${path}`).toBeDefined()
    expect(op.tags).toContain('Checkout / Customer')
    expect(op.security).toEqual(
      expect.arrayContaining([{ 'access-token': [] }]),
    )
  }
  const dto = doc.components.schemas.CreateReservationDto
  expect(dto.required).toEqual(
    expect.arrayContaining(['countryCode', 'requestId']),
  )
  expect(Object.keys(dto.properties).sort()).toEqual([
    'countryCode',
    'requestId',
  ])
  const response =
    doc.components.schemas.CheckoutReservationResponseDto.properties
  for (const key of [
    'status',
    'expiresAt',
    'subtotalMinor',
    'estimatedTotalMinor',
    'payable',
    'items',
  ])
    expect(response).toHaveProperty(key)
  expect(
    (
      await request.post('/v1/checkout/reservations', {
        data: { countryCode: 'US' },
      })
    ).status(),
  ).toBe(401)
})
