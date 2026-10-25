'use strict'

// Explicit, opt-in walkthrough against ONLY the local kookaburra-api-dev DB.
// This never runs migrations, resets data, or queries an external host.
const { spawnSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { parse } = require('dotenv')
const { Client } = require('pg')

const root = path.resolve(__dirname, '..')

function assertLocalDb(raw, variable) {
  let url
  try {
    url = new URL(raw || '')
  } catch {
    throw new Error(`${variable} is missing or invalid in .env`)
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new Error(`${variable} must use PostgreSQL`)
  }
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  ) {
    throw new Error(`${variable} must point to LOCAL PostgreSQL (no Neon/VPS)`)
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== 'kookaburra-api-dev') {
    throw new Error(`${variable} must select kookaburra-api-dev exactly`)
  }
  if (!url.username || !url.password) {
    throw new Error(`${variable} must include a username and password`)
  }
  return raw
}

async function main() {
  const envFile = path.join(root, '.env')
  if (!existsSync(envFile)) {
    throw new Error(
      'Missing .env. Configure your LOCAL development database first',
    )
  }
  const vars = parse(readFileSync(envFile))
  const url = assertLocalDb(vars.DATABASE_URL, 'DATABASE_URL')
  if (vars.DIRECT_URL) assertLocalDb(vars.DIRECT_URL, 'DIRECT_URL')
  if (!vars.JWT_ACCESS_SECRET || vars.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in .env')
  }
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 10000,
  })
  try {
    await client.connect()
    const result = await client.query('SELECT current_database() AS name')
    if (result.rows[0]?.name !== 'kookaburra-api-dev') {
      throw new Error(
        'Actual PostgreSQL database did not match kookaburra-api-dev',
      )
    }
    await client.query('SELECT id FROM users LIMIT 1')
  } finally {
    await client.end().catch(() => {})
  }

  const childEnv = {
    ...process.env,
    ...vars,
    DATABASE_URL: url,
    DIRECT_URL: url,
    NODE_ENV: 'development',
    PORT: '4102',
    API_TEST_PORT: '4102',
    API_TEST_MODE: 'dev-inspect',
    API_DEV_INSPECT_APPROVED: 'YES',
    SWAGGER_ENABLED: 'true',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  }
  process.stdout.write(
    'Verified LOCAL PostgreSQL database: kookaburra-api-dev\n' +
      'This walkthrough writes NEW uniquely named inspection users and retains them.\n' +
      'Temporary STAFF accounts are disabled and test sessions revoked at the end.\n' +
      'No existing users, products, or orders will be deleted.\n' +
      'Swagger visual test server: http://127.0.0.1:4102/docs\n',
  )
  const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
  const child = spawnSync(
    process.execPath,
    [
      cli,
      'test',
      '--config=playwright.swagger.config.mjs',
      '--project=visual-dev',
    ],
    { cwd: root, env: childEnv, stdio: 'inherit', windowsHide: true },
  )
  if (child.error) throw child.error
  process.exitCode = child.status ?? 1
}

void main().catch((error) => {
  process.stderr.write(
    'Refusing dev database visual test: ' +
      (error instanceof Error ? error.message : 'unknown error') +
      '\n',
  )
  process.exitCode = 2
})
