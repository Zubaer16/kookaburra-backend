export type Environment = {
  NODE_ENV: 'development' | 'test' | 'production'
  PORT: number
  CORS_ORIGINS: string
  SWAGGER_ENABLED: boolean
  DATABASE_URL: string
  JWT_ACCESS_SECRET: string
  MEDIA_CLOUD_NAME: string
  MEDIA_API_KEY: string
  MEDIA_API_SECRET: string
  MEDIA_NAMESPACE: string
}

/** Validate deployment config without disclosing secrets in thrown errors. */
export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const mode = raw.NODE_ENV ?? 'development'
  if (mode !== 'development' && mode !== 'test' && mode !== 'production') {
    throw new Error('NODE_ENV must be development, test or production')
  }
  const port = Number(raw.PORT ?? 4000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }
  if (raw.CORS_ORIGINS != null && typeof raw.CORS_ORIGINS !== 'string') {
    throw new Error('CORS_ORIGINS must be a comma-separated list of origins')
  }
  const origins = String(raw.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (new Set(origins).size !== origins.length) {
    throw new Error('CORS_ORIGINS contains duplicate origins')
  }
  for (const origin of origins) {
    let parsed: URL
    try {
      parsed = new URL(origin)
    } catch {
      throw new Error('Invalid CORS origin')
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password ||
      origin.includes('*')
    ) {
      throw new Error(
        'CORS_ORIGINS must contain exact origins, not paths or wildcards',
      )
    }
    if (mode === 'production' && parsed.protocol !== 'https:') {
      throw new Error('Production CORS origins must use HTTPS')
    }
  }
  if (mode === 'production' && origins.length === 0) {
    throw new Error('Production requires CORS_ORIGINS')
  }
  const swagger = raw.SWAGGER_ENABLED
  if (
    swagger != null &&
    !['true', 'false', true, false].includes(swagger as string | boolean)
  ) {
    throw new Error('SWAGGER_ENABLED must be true or false')
  }
  const enabled =
    swagger == null
      ? mode !== 'production'
      : swagger === true || swagger === 'true'

  const db = typeof raw.DATABASE_URL === 'string' ? raw.DATABASE_URL.trim() : ''
  const secret =
    typeof raw.JWT_ACCESS_SECRET === 'string' ? raw.JWT_ACCESS_SECRET : ''
  if (db && !/^postgres(ql)?:\/\//.test(db)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string')
  }
  if ((mode === 'production' || db.length > 0) && secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET requires at least 32 characters')
  }
  if (mode === 'production' && !db) {
    throw new Error('Production requires DATABASE_URL')
  }
  const cloudName = String(raw.MEDIA_CLOUD_NAME ?? '').trim()
  const apiKey = String(raw.MEDIA_API_KEY ?? '').trim()
  const apiSecret = String(raw.MEDIA_API_SECRET ?? '').trim()
  const namespace = String(
    raw.MEDIA_NAMESPACE ?? 'projects/kookaburra/products',
  ).trim()
  if (
    (cloudName || apiKey || apiSecret) &&
    !(cloudName && apiKey && apiSecret)
  ) {
    throw new Error('Media Cloudinary credentials must be configured together')
  }
  if (cloudName && !/^[a-zA-Z0-9_-]{1,80}$/.test(cloudName))
    throw new Error('Invalid Cloudinary cloud name')
  if (apiKey && !/^[0-9]{4,40}$/.test(apiKey))
    throw new Error('Invalid Cloudinary API key')
  if (
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(namespace) ||
    namespace.length > 160
  )
    throw new Error('Invalid media namespace')
  return {
    MEDIA_CLOUD_NAME: cloudName,
    MEDIA_API_KEY: apiKey,
    MEDIA_API_SECRET: apiSecret,
    MEDIA_NAMESPACE: namespace,
    NODE_ENV: mode,
    PORT: port,
    CORS_ORIGINS: origins.join(','),
    SWAGGER_ENABLED: enabled,
    DATABASE_URL: db,
    JWT_ACCESS_SECRET: secret,
  }
}
