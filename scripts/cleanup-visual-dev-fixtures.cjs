'use strict'

// Explicit Node built-in import keeps ESLint no-undef checks intact.
const console = require('node:console')
// Preview by default; explicit --apply deletes ONLY historical Swagger
// inspection users in LOCAL kookaburra-api-dev, never test/live/remote DB.
const { Client } = require('pg')
const { readFileSync, existsSync } = require('node:fs')
const path = require('node:path')
const { parse } = require('dotenv')

const cwd = path.resolve(__dirname, '..')
const apply = process.argv.length === 3 && process.argv[2] === '--apply'
if (process.argv.length > 2 && !apply) {
  console.error(
    'Usage: npm run cleanup:visual-dev:preview or npm run cleanup:visual-dev:apply',
  )
  process.exit(2)
}
const uuid =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const pattern = new RegExp(
  `^visual-dev-(customer|staff)-${uuid}@example\\.test$`,
)

function assertLocalDevelopmentDb(raw) {
  let url
  try {
    url = new URL(raw || '')
  } catch {
    throw new Error('Missing/invalid DATABASE_URL in .env')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('PostgreSQL URL required')
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  ) {
    throw new Error('Refusing any non-local database host')
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== 'kookaburra-api-dev') {
    throw new Error('Refusing any database other than kookaburra-api-dev')
  }
  if (
    url.searchParams.has('schema') &&
    url.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('Only the public schema is supported')
  }
  if (!url.username || !url.password) throw new Error('DB credentials missing')
  return raw
}

async function main() {
  const envPath = path.join(cwd, '.env')
  if (!existsSync(envPath))
    throw new Error('Missing .env in backend repository')
  const env = parse(readFileSync(envPath))
  const connectionString = assertLocalDevelopmentDb(env.DATABASE_URL)
  if (env.DIRECT_URL) assertLocalDevelopmentDb(env.DIRECT_URL)
  const db = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  try {
    await db.connect()
    await db.query('BEGIN')
    // Lock rows in apply mode so their roles cannot change mid-deletion.
    const rows = (
      await db.query(`SELECT id, email, role::text AS role, status::text AS status,
      created_at FROM public.users WHERE email LIKE 'visual-dev-%@example.test'
      ORDER BY created_at, id ${apply ? 'FOR UPDATE' : ''}`)
    ).rows
    // If someone used the same prefix for real accounts, STOP rather than guessing.
    for (const row of rows) {
      const match = pattern.exec(row.email)
      if (!match || row.role !== match[1].toUpperCase()) {
        throw new Error(
          'Unexpected account under visual-dev- namespace; refusing cleanup',
        )
      }
    }
    if (rows.length > 200)
      throw new Error(
        'More than 200 candidates; inspect manually before cleanup',
      )
    const ids = rows.map((row) => row.id)
    const sessions = ids.length
      ? Number(
          (
            await db.query(
              'SELECT count(*)::int AS n FROM public.auth_sessions WHERE user_id = ANY($1::uuid[])',
              [ids],
            )
          ).rows[0].n,
        )
      : 0
    const audit = ids.length
      ? (
          await db.query(
            `SELECT actor_id, action, target_type, target_id
      FROM public.audit_events WHERE actor_id = ANY($1::uuid[])`,
            [ids],
          )
        ).rows
      : []
    for (const event of audit) {
      if (
        !['customer.login', 'admin.login'].includes(event.action) ||
        event.target_type !== 'user' ||
        event.target_id !== event.actor_id
      ) {
        throw new Error(
          'Candidate has non-walkthrough audit activity; refusing cleanup',
        )
      }
    }
    console.log('Verified database: local kookaburra-api-dev')
    console.log(
      'Mode:',
      apply ? 'APPLY (permanent delete)' : 'PREVIEW (no changes)',
    )
    console.log(
      'Candidate accounts:',
      rows.length,
      '| related sessions:',
      sessions,
      '| own login audits:',
      audit.length,
    )
    for (const row of rows) {
      console.log(
        row.email,
        `[${row.role}/${row.status}]`,
        row.created_at.toISOString(),
      )
    }
    if (apply && rows.length) {
      // Query against exact locked account IDs; no wildcard DELETEs.
      const deletedAudits = await db.query(
        'DELETE FROM public.audit_events WHERE actor_id = ANY($1::uuid[])',
        [ids],
      )
      const deletedSessions = await db.query(
        'DELETE FROM public.auth_sessions WHERE user_id = ANY($1::uuid[])',
        [ids],
      )
      const deletedUsers = await db.query(
        'DELETE FROM public.users WHERE id = ANY($1::uuid[])',
        [ids],
      )
      if (
        deletedUsers.rowCount !== rows.length ||
        deletedAudits.rowCount !== audit.length ||
        deletedSessions.rowCount !== sessions
      ) {
        throw new Error(
          'Unexpected delete counts; rolling back the entire transaction',
        )
      }
      console.log(
        `Deleted ${deletedUsers.rowCount} inspection users and their own related test rows.`,
      )
    }
    if (apply) await db.query('COMMIT')
    else await db.query('ROLLBACK')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await db.end().catch(() => {})
  }
}

void main().catch((error) => {
  console.error('Visual-dev fixture cleanup aborted:', error.message)
  process.exitCode = 1
})
