'use strict'

// Only this runner may give DB-writing API tests a DATABASE_URL.
// API_TEST_DATABASE_URL must point to a separate, LOCAL database with a fixed name.
const { spawnSync } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { existsSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { config } = require('dotenv')

const root = path.resolve(__dirname, '..')
const mode = process.argv[2]
const allowed = [
  'smoke',
  'db',
  'db-deploy',
  'report',
  'visual-smoke',
  'visual-db',
  'visual-guest',
  'visual-checkout',
  'visual-reservation',
  'visual-orders',
  'visual-payments',
  'visual-report',
  'security',
]
if (!allowed.includes(mode)) {
  process.stderr.write(
    'Usage: node scripts/run-api-tests.cjs smoke|db|db-deploy|security|report|visual-smoke|visual-db|visual-report\n',
  )
  process.exit(2)
}

const env = { ...process.env }
const testEnvPath = path.join(root, '.env.api-test')
if (
  !['smoke', 'visual-smoke', 'report', 'visual-report'].includes(mode) &&
  existsSync(testEnvPath)
) {
  // Store ONLY API_TEST_DATABASE_URL here. Never load ordinary .env for tests.
  const vars = config({ path: testEnvPath, processEnv: {} }).parsed || {}
  if (!env.API_TEST_DATABASE_URL && vars.API_TEST_DATABASE_URL) {
    env.API_TEST_DATABASE_URL = vars.API_TEST_DATABASE_URL
  }
}

function baseEnv() {
  return {
    ...env,
    NODE_ENV: 'test',
    PORT: '4101',
    API_TEST_PORT: '4101',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    SWAGGER_ENABLED: 'true',
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
    // Never let API tests call a developer/client Cloudinary account.
    MEDIA_CLOUD_NAME: '',
    MEDIA_API_KEY: '',
    MEDIA_API_SECRET: '',
    MEDIA_NAMESPACE: 'projects/kookaburra/products',
    MEDIA_PROVIDER: 'cloudinary',
    STRIPE_TEST_ENABLED: 'false',
    STRIPE_TEST_CHECKOUT_ENABLED: 'false',
    STRIPE_TEST_SECRET_KEY: '',
    STRIPE_TEST_WEBHOOK_SECRET: '',
    MEDIA_S3_ENDPOINT: '',
    MEDIA_S3_BUCKET: '',
    MEDIA_S3_REGION: '',
    MEDIA_S3_ACCESS_KEY_ID: '',
    MEDIA_S3_SECRET_ACCESS_KEY: '',
    MEDIA_S3_PUBLIC_BASE_URL: '',
    MEDIA_DISK_ROOT: '',
    MEDIA_DISK_API_BASE_URL: '',
    MEDIA_DISK_PUBLIC_BASE_URL: '',
    MEDIA_DISK_UPLOAD_SECRET: '',
  }
}

function databaseEnv() {
  const connection = env.API_TEST_DATABASE_URL || ''
  if (!connection)
    throw new Error(
      'Set API_TEST_DATABASE_URL in ignored .env.api-test (do not use .env)',
    )
  let url
  try {
    url = new URL(connection)
  } catch {
    throw new Error('Invalid API_TEST_DATABASE_URL')
  }
  const host = url.hostname.toLowerCase()
  const dbName = decodeURIComponent(url.pathname.slice(1))
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new Error('API tests require PostgreSQL')
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error(
      'Refusing non-local API_TEST_DATABASE_URL (Neon / production prohibited)',
    )
  }
  if (dbName !== 'kookaburra_api_test') {
    throw new Error(
      'Refusing unsafe database name: only kookaburra_api_test is allowed',
    )
  }
  if (!url.username || !url.password)
    throw new Error('Test DB URL must include credentials')
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!env[key]) continue
    try {
      const other = new URL(env[key])
      if (
        decodeURIComponent(other.pathname.slice(1)) === dbName &&
        ['localhost', '127.0.0.1', '[::1]'].includes(
          other.hostname.toLowerCase(),
        )
      ) {
        throw new Error(
          'Refusing test DB because the same database is configured as ' + key,
        )
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Refusing'))
        throw error
    }
  }
  return { ...baseEnv(), DATABASE_URL: connection, DIRECT_URL: connection }
}

function run(bin, args, childEnv) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    env: childEnv,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

try {
  if (mode === 'report') {
    const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
    run(cli, ['show-report', 'playwright-api-report'], env)
  }
  if (mode === 'visual-report') {
    const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
    run(cli, ['show-report', 'playwright-swagger-report'], env)
  }
  if (mode === 'smoke' || mode === 'visual-smoke') {
    const clean = baseEnv()
    // Deliberately suppress dev/live DB credentials from the test server.
    clean.DATABASE_URL = ''
    clean.DIRECT_URL = ''
    clean.API_TEST_MODE = 'smoke'
    const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
    run(
      cli,
      mode === 'visual-smoke'
        ? [
            'test',
            '--config=playwright.swagger.config.mjs',
            '--project=visual-smoke',
          ]
        : ['test', '--config=playwright.api.config.mjs', '--project=smoke'],
      clean,
    )
  }
  const safe = databaseEnv() // fails closed before any DB request
  if (mode === 'db-deploy') {
    const prisma = path.join(
      root,
      'node_modules',
      'prisma',
      'build',
      'index.js',
    )
    run(prisma, ['migrate', 'deploy'], safe)
  }
  // DB and Chromium-DB suites exercise real local disk I/O in an isolated,
  // throwaway OS temporary folder; SECURITY stays on unconfigured cloudinary.
  if (
    mode === 'db' ||
    mode === 'visual-db' ||
    mode === 'visual-guest' ||
    mode === 'visual-checkout' ||
    mode === 'visual-reservation' ||
    mode === 'visual-orders' ||
    mode === 'visual-payments'
  ) {
    safe.MEDIA_PROVIDER = 'disk'
    safe.MEDIA_DISK_ROOT = path.join(
      os.tmpdir(),
      `kb-media-api-test-${randomBytes(10).toString('hex')}`,
    )
    safe.MEDIA_DISK_API_BASE_URL = 'http://127.0.0.1:4101'
    safe.MEDIA_DISK_PUBLIC_BASE_URL = 'http://127.0.0.1:4101'
    safe.MEDIA_DISK_UPLOAD_SECRET = randomBytes(48).toString('hex')
  }
  safe.API_TEST_MODE = 'db'
  const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
  run(
    cli,
    mode === 'visual-db' ||
      mode === 'visual-guest' ||
      mode === 'visual-checkout' ||
      mode === 'visual-reservation' ||
      mode === 'visual-orders' ||
      mode === 'visual-payments'
      ? [
          'test',
          '--config=playwright.swagger.config.mjs',
          '--project=visual-db',
          ...(mode === 'visual-guest'
            ? ['--grep', '04A-2 Swagger Chromium: guest capability']
            : []),
          ...(mode === 'visual-checkout'
            ? ['--grep', '04B-1 Swagger Chromium: owner policy configuration']
            : []),
          ...(mode === 'visual-reservation'
            ? ['--grep', '04B-2 Swagger Chromium: reservation']
            : []),
          ...(mode === 'visual-orders'
            ? ['--grep', '04C-1 Swagger Chromium: unpaid order']
            : []),
          ...(mode === 'visual-payments'
            ? ['--grep', '04C-2A Swagger Chromium: test payment']
            : []),
        ]
      : mode === 'security'
        ? ['test', '--config=playwright.api.config.mjs', '--project=security']
        : ['test', '--config=playwright.api.config.mjs', '--project=db'],
    safe,
  )
} catch (error) {
  process.stderr.write(
    'API test setup refused: ' +
      (error instanceof Error ? error.message : 'unknown error') +
      '\n',
  )
  process.exit(2)
}
