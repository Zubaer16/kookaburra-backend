import { expect, test } from '@playwright/test'

test('04A-2 OpenAPI: guest capability is not JWT, merge stays JWT-only', async ({
  request,
}) => {
  const res = await request.get('/docs-json')
  expect(res.status()).toBe(200)
  const doc = await res.json()
  for (const [method, path] of [
    ['post', '/v1/guest-cart'],
    ['get', '/v1/guest-cart'],
    ['get', '/v1/guest-cart/quote'],
    ['put', '/v1/guest-cart/items'],
    ['delete', '/v1/guest-cart/items/{id}'],
    ['delete', '/v1/guest-cart/items'],
    ['delete', '/v1/guest-cart'],
  ]) {
    const operation = doc.paths[path]?.[method]
    expect(operation, `${method} ${path}`).toBeDefined()
    expect(operation.tags).toContain('Cart / Guest')
    // This is a header-based API key, not a customer JWT and not an
    // editable required-header parameter (which Swagger UI can reject).
    // Screenshot regression: duplicate required Parameters field must not
    // reappear even when a path-item-level parameter is present.
    const capability = [
      ...(doc.paths[path].parameters ?? []),
      ...(operation.parameters ?? []),
    ].find(
      (parameter: { name?: string; in?: string }) =>
        parameter.name?.toLowerCase() === 'x-guest-cart-token' &&
        parameter.in === 'header',
    )
    expect(
      capability,
      'guest capability must not be duplicated as a parameter',
    ).toBeUndefined()
    if (method === 'post' && path === '/v1/guest-cart') {
      expect(operation.security ?? []).toEqual([])
    } else {
      expect(operation.security).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'guest-cart-token': [] }),
        ]),
      )
      expect(operation.security).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 'access-token': [] }),
        ]),
      )
    }
    expect(Object.keys(operation.responses ?? {}).length).toBeGreaterThan(0)
  }
  expect(doc.components.securitySchemes['guest-cart-token']).toEqual(
    expect.objectContaining({
      type: 'apiKey',
      in: 'header',
      name: 'X-Guest-Cart-Token',
    }),
  )
  const merge = doc.paths['/v1/cart/merge'].post
  expect(merge.tags).toContain('Cart / Customer')
  expect(merge.security).toEqual(
    expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
  )
  expect(doc.components.schemas.MergeGuestCartDto.properties).toHaveProperty(
    'guestToken',
  )
  expect(doc.components.schemas.GuestCartCreatedDto.properties).toHaveProperty(
    'guestToken',
  )
})
