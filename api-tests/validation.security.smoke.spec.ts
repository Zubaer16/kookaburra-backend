import { expect, test } from '@playwright/test'

/** No database configured: these must fail in the ValidationPipe/Guard. */
test.describe('Phase 02 security validation smoke (database not required)', () => {
  test('Register rejects missing email and password', async ({ request }) => {
    const response = await request.post('/v1/auth/register', { data: {} })
    expect(response.status()).toBe(400)
  })

  test('Register rejects non-string email/password', async ({ request }) => {
    const response = await request.post('/v1/auth/register', {
      data: { email: { nested: 'value' }, password: 123456789012 },
    })
    expect(response.status()).toBe(400)
  })

  test('Register rejects overly long email or password', async ({
    request,
  }) => {
    const email = 'a'.repeat(320) + '@example.test'
    const response = await request.post('/v1/auth/register', {
      data: { email, password: 'ValidPasswordForTesting123!' },
    })
    expect(response.status()).toBe(400)
    const longPassword = await request.post('/v1/auth/register', {
      data: { email: 'security-check@example.test', password: 'X'.repeat(129) },
    })
    expect(longPassword.status()).toBe(400)
  })

  test('Login rejects attempts to supply an administrative role', async ({
    request,
  }) => {
    for (const path of ['/v1/auth/login', '/v1/admin/auth/login']) {
      const response = await request.post(path, {
        data: {
          email: 'security-check@example.test',
          password: 'ValidPasswordForTesting123!',
          role: 'OWNER',
        },
      })
      expect(response.status()).toBe(400)
    }
  })

  test('Refresh and logout reject unknown fields or non-string tokens', async ({
    request,
  }) => {
    for (const path of ['/v1/auth/refresh', '/v1/auth/logout']) {
      const nonString = await request.post(path, { data: { refreshToken: 42 } })
      expect(nonString.status()).toBe(400)
      const extra = await request.post(path, {
        data: { refreshToken: 'x'.repeat(30), role: 'OWNER' },
      })
      expect(extra.status()).toBe(400)
    }
  })
})
