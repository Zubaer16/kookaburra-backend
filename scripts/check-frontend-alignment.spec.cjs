'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { evaluate } = require('./check-frontend-alignment.cjs')

test('cross-repo audit reports actual baseline without claiming runtime integration', (t) => {
  const roots = {
    backend:
      process.env.KOOKABURRA_BACKEND_DIR || path.resolve(__dirname, '..'),
    admin:
      process.env.KOOKABURRA_ADMIN_DIR ||
      path.resolve(__dirname, '../../kookaburra-admin'),
    storefront:
      process.env.KOOKABURRA_STOREFRONT_DIR ||
      path.resolve(__dirname, '../../kookaburra-storefront'),
  }
  if (
    !fs.existsSync(path.join(roots.admin, 'lib/types.ts')) ||
    !fs.existsSync(path.join(roots.storefront, 'lib/api/contracts.ts'))
  ) {
    t.skip(
      'Set KOOKABURRA_ADMIN_DIR and KOOKABURRA_STOREFRONT_DIR for cross-repo checks',
    )
    return
  }
  const result = evaluate(roots)
  assert.deepEqual(result.missing, [])
  assert.equal(result.results.length, 15)
  assert.equal(
    result.results.find((item) => item.id === 'prefix')?.status,
    'MATCH',
  )
  assert.equal(
    result.results.find((item) => item.id === 'catalog-stock-guard')?.status,
    'MATCH',
  )
  assert.equal(
    result.results.find((item) => item.id === 'session-transport')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'staff-permissions')?.status,
    'ADAPTER',
  )
  assert.equal(
    result.results.find((item) => item.id === 'product-media')?.status,
    'ADAPTER',
  )
})

test('missing projects are never treated as aligned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kookaburra-alignment-'))
  try {
    const result = evaluate({ backend: dir, admin: dir, storefront: dir })
    assert.ok(result.missing.length >= 3)
    assert.ok(result.results.every((f) => f.status === 'REVIEW_REQUIRED'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
