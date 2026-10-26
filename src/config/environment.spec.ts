import { validateEnvironment } from './environment'

describe('environment configuration', () => {
  it('uses restrictive defaults for local dev', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      SWAGGER_ENABLED: true,
      CORS_ORIGINS: '',
      DATABASE_URL: '',
    })
  })
  it('requires explicit allowed origins and database secrets in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'CORS',
    )
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
      }),
    ).toThrow('JWT')
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
      }),
    ).toThrow('DATABASE')
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://shop.example',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
        DATABASE_URL: 'postgresql://local.example/db',
      }),
    ).not.toThrow()
  })
  it('rejects wildcard, paths and insecure production origins', () => {
    for (const origin of [
      '*',
      'https://shop.example.com/path',
      'http://shop.example.com',
    ]) {
      expect(() =>
        validateEnvironment({ NODE_ENV: 'production', CORS_ORIGINS: origin }),
      ).toThrow()
    }
  })
  it('validates optional S3/R2 configuration and avoids provider ambiguity', () => {
    const setup = {
      MEDIA_PROVIDER: 's3',
      MEDIA_S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
      MEDIA_S3_BUCKET: 'sample-assets',
      MEDIA_S3_REGION: 'us-east-1',
      MEDIA_S3_ACCESS_KEY_ID: 'EXAMPLE12345',
      MEDIA_S3_SECRET_ACCESS_KEY: 'this-is-not-a-real-secret',
      MEDIA_S3_PUBLIC_BASE_URL: 'https://cdn.example.test',
    }
    expect(validateEnvironment(setup).MEDIA_PROVIDER).toBe('s3')
    expect(() => validateEnvironment({ MEDIA_PROVIDER: 'untrusted' })).toThrow()
    expect(() => validateEnvironment({ MEDIA_PROVIDER: 's3' })).toThrow()
    expect(() => validateEnvironment({ ...setup, MEDIA_S3_ENDPOINT: 'http://127.0.0.1:9000' })).toThrow()
    expect(() => validateEnvironment({ ...setup, MEDIA_S3_PUBLIC_BASE_URL: 'https://cdn.example.test/path?redirect=x' })).toThrow()
    expect(validateEnvironment({}).MEDIA_PROVIDER).toBe('cloudinary')
  })
  it('rejects invalid ports and malformed docs flag', () => {
    expect(() => validateEnvironment({ PORT: '-4' })).toThrow()
    expect(() =>
      validateEnvironment({ SWAGGER_ENABLED: 'sometimes' }),
    ).toThrow()
  })
})
