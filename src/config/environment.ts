import path from 'node:path'
export type Environment = {
  STRIPE_TEST_ENABLED: boolean
  STRIPE_TEST_SECRET_KEY: string
  STRIPE_TEST_WEBHOOK_SECRET: string
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
  MEDIA_PROVIDER: 'cloudinary' | 's3' | 'disk'
  MEDIA_S3_ENDPOINT: string
  MEDIA_S3_BUCKET: string
  MEDIA_S3_REGION: string
  MEDIA_S3_ACCESS_KEY_ID: string
  MEDIA_S3_SECRET_ACCESS_KEY: string
  MEDIA_S3_PUBLIC_BASE_URL: string
  MEDIA_DISK_ROOT: string
  MEDIA_DISK_API_BASE_URL: string
  MEDIA_DISK_PUBLIC_BASE_URL: string
  MEDIA_DISK_UPLOAD_SECRET: string
  MEDIA_CDN_CF_ZONE_ID: string
  MEDIA_CDN_CF_API_TOKEN: string
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
  const provider = String(raw.MEDIA_PROVIDER ?? 'cloudinary')
  if (provider !== 'cloudinary' && provider !== 's3' && provider !== 'disk')
    throw new Error('MEDIA_PROVIDER must be cloudinary, s3 or disk')
  const s3Endpoint = String(raw.MEDIA_S3_ENDPOINT ?? '').trim()
  const s3Bucket = String(raw.MEDIA_S3_BUCKET ?? '').trim()
  const s3Region = String(raw.MEDIA_S3_REGION ?? '').trim()
  const s3AccessKey = String(raw.MEDIA_S3_ACCESS_KEY_ID ?? '').trim()
  const s3Secret = String(raw.MEDIA_S3_SECRET_ACCESS_KEY ?? '').trim()
  const s3PublicBase = String(raw.MEDIA_S3_PUBLIC_BASE_URL ?? '').trim()
  const allS3 = [
    s3Endpoint,
    s3Bucket,
    s3Region,
    s3AccessKey,
    s3Secret,
    s3PublicBase,
  ]
  if (allS3.some(Boolean) && !allS3.every(Boolean))
    throw new Error('S3 media configuration requires all six variables')
  if (provider === 's3' && !allS3.every(Boolean))
    throw new Error('Selected S3 media provider must be configured')
  if (s3Endpoint) {
    const endpoint = new URL(s3Endpoint)
    const cdn = new URL(s3PublicBase)
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.origin !== s3Endpoint ||
      endpoint.username ||
      endpoint.password ||
      !['https:'].includes(cdn.protocol) ||
      !!cdn.username ||
      !!cdn.password ||
      !!cdn.search ||
      !!cdn.hash ||
      s3PublicBase.endsWith('/') ||
      s3PublicBase.includes('..') ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3Bucket) ||
      !/^(?:[a-z0-9-]{2,40}|auto)$/.test(s3Region) ||
      !/^[a-zA-Z0-9_-]{4,128}$/.test(s3AccessKey) ||
      s3Secret.length < 16
    )
      throw new Error('Invalid S3 media configuration')
  }
  // Persistent VPS disk storage: never use ephemeral serverless local files.
  const diskRoot = String(raw.MEDIA_DISK_ROOT ?? '').trim()
  const diskApi = String(raw.MEDIA_DISK_API_BASE_URL ?? '').trim()
  const diskPublic = String(raw.MEDIA_DISK_PUBLIC_BASE_URL ?? '').trim()
  const diskSecret = String(raw.MEDIA_DISK_UPLOAD_SECRET ?? '')
  const diskFields = [diskRoot, diskApi, diskPublic, diskSecret]
  if (diskFields.some(Boolean) && !diskFields.every(Boolean))
    throw new Error('Disk media configuration requires all four variables')
  if (provider === 'disk' && !diskFields.every(Boolean))
    throw new Error('Selected disk media provider must be configured')
  if (diskFields.every(Boolean)) {
    // Node's native win32 path handling is used on Windows; posix on VPS.
    if (
      !path.isAbsolute(diskRoot) ||
      path.normalize(diskRoot) === path.parse(diskRoot).root ||
      diskRoot.split(/[\\/]/).includes('..') ||
      diskSecret.length < 32
    )
      throw new Error('Invalid disk storage root or signing secret')
    for (const base of [diskApi, diskPublic]) {
      let url: URL
      try {
        url = new URL(base)
      } catch {
        throw new Error('Invalid disk media URL')
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        (mode === 'production' && url.protocol !== 'https:') ||
        url.origin !== base ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error(
          'Disk API/public base must be a bare HTTPS origin in production',
        )
    }
  }
  // Optional Cloudflare cache purge. Configure both together; deletion jobs
  // retry if the CDN is unavailable instead of silently marking cleanup done.
  const cdnZoneId = String(raw.MEDIA_CDN_CF_ZONE_ID ?? '').trim()
  const cdnToken = String(raw.MEDIA_CDN_CF_API_TOKEN ?? '').trim()
  if (!!cdnZoneId !== !!cdnToken)
    throw new Error(
      'Cloudflare CDN zone ID and token must be configured together',
    )
  if (cdnZoneId && !/^[0-9a-f]{32}$/i.test(cdnZoneId))
    throw new Error('Invalid Cloudflare CDN zone ID')
  if (
    cdnToken &&
    (cdnToken.length < 20 || cdnToken.length > 512 || /\s/.test(cdnToken))
  )
    throw new Error('Invalid Cloudflare CDN API token')
  const stripeFlag = raw.STRIPE_TEST_ENABLED ?? 'false'
  if (![true, false, 'true', 'false'].includes(stripeFlag as string | boolean))
    throw new Error('STRIPE_TEST_ENABLED must be true or false')
  const stripeEnabled = stripeFlag === true || stripeFlag === 'true'
  const stripeKey = typeof raw.STRIPE_TEST_SECRET_KEY === 'string' ? raw.STRIPE_TEST_SECRET_KEY : ''
  const stripeWebhook = typeof raw.STRIPE_TEST_WEBHOOK_SECRET === 'string' ? raw.STRIPE_TEST_WEBHOOK_SECRET : ''
  if (stripeKey && !/^sk_test_[A-Za-z0-9]{8,}$/.test(stripeKey))
    throw new Error('Only Stripe test secret keys are permitted')
  if (stripeWebhook && !/^whsec_[A-Za-z0-9]{8,}$/.test(stripeWebhook))
    throw new Error('Invalid Stripe webhook signing secret')
  if (stripeEnabled && (!stripeKey || !stripeWebhook))
    throw new Error('Stripe TEST mode requires a test key and webhook secret')
  return {
    STRIPE_TEST_ENABLED: stripeEnabled,
    STRIPE_TEST_SECRET_KEY: stripeKey,
    STRIPE_TEST_WEBHOOK_SECRET: stripeWebhook,
    MEDIA_CDN_CF_ZONE_ID: cdnZoneId,
    MEDIA_CDN_CF_API_TOKEN: cdnToken,
    MEDIA_PROVIDER: provider,
    MEDIA_DISK_ROOT: diskRoot,
    MEDIA_DISK_API_BASE_URL: diskApi,
    MEDIA_DISK_PUBLIC_BASE_URL: diskPublic,
    MEDIA_DISK_UPLOAD_SECRET: diskSecret,
    MEDIA_S3_ENDPOINT: s3Endpoint,
    MEDIA_S3_BUCKET: s3Bucket,
    MEDIA_S3_REGION: s3Region,
    MEDIA_S3_ACCESS_KEY_ID: s3AccessKey,
    MEDIA_S3_SECRET_ACCESS_KEY: s3Secret,
    MEDIA_S3_PUBLIC_BASE_URL: s3PublicBase,
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
