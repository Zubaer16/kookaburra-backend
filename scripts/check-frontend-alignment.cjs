'use strict'
/* global module */

// Dependency-free cross-repository *source* compatibility audit.
// It intentionally does not claim that an API request or frontend integration ran.
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const console = require('node:console')

const rules = require('../contracts/frontend-alignment.v1.json')

function read(root, relative) {
  const target = path.join(root, relative)
  try {
    return fs.readFileSync(target, 'utf8')
  } catch {
    return ''
  }
}

function evaluate(roots) {
  const source = {
    backendCatalogController: read(
      roots.backend,
      'src/catalog/catalog.controller.ts',
    ),
    backendCatalogDto: read(roots.backend, 'src/catalog/catalog.dto.ts'),
    backendCatalogService: read(
      roots.backend,
      'src/catalog/catalog.service.ts',
    ),
    backendAuthCustomer: read(
      roots.backend,
      'src/auth/customer-auth.controller.ts',
    ),
    backendAuthDto: read(roots.backend, 'src/auth/auth.dto.ts'),
    backendAuthGuard: read(roots.backend, 'src/auth/access.guard.ts'),
    backendInventoryController: read(
      roots.backend,
      'src/inventory/inventory.controller.ts',
    ),
    backendInventoryDto: read(roots.backend, 'src/inventory/inventory.dto.ts'),
    backendSchema: read(roots.backend, 'prisma/schema.prisma'),
    adminTypes: read(roots.admin, 'lib/types.ts'),
    adminStore: read(roots.admin, 'lib/store.ts'),
    adminPermissions: read(roots.admin, 'lib/workspace-policy.ts'),
    adminCompatibilityDraft: read(roots.admin, 'lib/compatibility-contract.ts'),
    storefrontTransport: read(roots.storefront, 'lib/api/client.ts'),
    storefrontContracts: read(roots.storefront, 'lib/api/contracts.ts'),
    storefrontAdapters: read(
      roots.storefront,
      'lib/api/storefront-adapters.ts',
    ),
    storefrontCatalog: read(roots.storefront, 'lib/catalog.ts'),
  }

  const required = {
    backend: [
      'src/catalog/catalog.controller.ts',
      'src/inventory/inventory.controller.ts',
      'src/auth/customer-auth.controller.ts',
    ],
    admin: ['lib/types.ts', 'lib/store.ts', 'lib/workspace-policy.ts'],
    storefront: ['lib/api/contracts.ts', 'lib/api/client.ts', 'lib/catalog.ts'],
  }
  const missing = Object.entries(required).flatMap(([repo, files]) =>
    files
      .filter((file) => !fs.existsSync(path.join(roots[repo], file)))
      .map((file) => `${repo}/${file}`),
  )

  const tests = {
    prefix:
      /app\.setGlobalPrefix\(['"]v1['"]\)/.test(
        read(roots.backend, 'src/bootstrap.ts'),
      ) && /path:\s*`\/v1\/\$\{string\}`/.test(source.storefrontTransport),
    'public-catalog':
      /@Get\('categories'\)/.test(source.backendCatalogController) &&
      /@Get\('products'\)/.test(source.backendCatalogController) &&
      /@Get\('products\/:slug'\)/.test(source.backendCatalogController),
    'catalog-pricing':
      /priceMinor!: number/.test(source.backendCatalogDto) &&
      /amountMinor: number/.test(source.storefrontContracts) &&
      /price: number/.test(source.adminTypes),
    'catalog-identity':
      /@default\(uuid\(\)\)/.test(source.backendSchema) &&
      /id: string/.test(source.storefrontContracts),
    'variant-shape':
      /options!: VariantOptionsDto/.test(source.backendCatalogDto) &&
      /options: Record<string, string>/.test(source.storefrontContracts),
    'category-shape':
      /parentId/.test(source.backendSchema) &&
      /parentId: string \| null/.test(source.storefrontContracts) &&
      /sortOrder/.test(source.backendSchema) &&
      /active/.test(source.backendSchema),
    'inventory-identity':
      /@Controller\('admin\/inventory'\)/.test(
        source.backendInventoryController,
      ) &&
      /requestId!: string/.test(source.backendInventoryDto) &&
      /adjustStock:\s*\(/.test(source.adminStore) &&
      /productId\?: string/.test(source.backendInventoryDto) &&
      /variantId\?: string/.test(source.backendInventoryDto),
    'catalog-stock-guard':
      /OmitType\(CreateProductDto, \['stockOnHand', 'variants'\]/.test(
        source.backendCatalogDto,
      ) &&
      /OmitType\(CreateVariantDto, \['stockOnHand'\]/.test(
        source.backendCatalogDto,
      ),
    'session-transport':
      /credentials:\s*'include'/.test(source.storefrontTransport) &&
      /accessToken!: string/.test(source.backendAuthDto) &&
      /authorization/i.test(source.backendAuthGuard),
    'staff-permissions':
      /'Catalog Editor'/.test(source.adminPermissions) &&
      /model StaffRole\s*\{/.test(source.backendSchema) &&
      /model StaffRolePermission\s*\{/.test(source.backendSchema) &&
      /model StaffRoleAssignment\s*\{/.test(source.backendSchema),
    'product-media':
      /images:/.test(source.storefrontContracts) &&
      /images\?: ProductMedia\[\]/.test(source.adminTypes) &&
      !/model MediaAsset\s*\{/.test(source.backendSchema),
    'commerce-future':
      /ApiCheckoutQuote/.test(source.storefrontContracts) &&
      !fs.existsSync(
        path.join(roots.backend, 'src/checkout/checkout.controller.ts'),
      ),
    'status-shape':
      /'Active' \| 'Draft'/.test(source.adminTypes) &&
      /ARCHIVED/.test(source.backendCatalogDto),
    'page-shape':
      /pageSize: number/.test(source.storefrontContracts) &&
      /presentPage\(items\.map\(presentCatalogProduct\)/.test(
        source.backendCatalogService,
      ),
    'fixture-protection':
      /NOT a backend UUID/.test(source.storefrontAdapters) &&
      /FIXTURE snapshots/.test(source.adminCompatibilityDraft),
  }

  const results = rules.findings.map((finding) => ({
    ...finding,
    detected: Boolean(tests[finding.id]),
    status: tests[finding.id] ? finding.status : 'REVIEW_REQUIRED',
  }))
  return {
    version: rules.version,
    roots,
    missing,
    results,
    totals: Object.fromEntries(
      [
        'MATCH',
        'ADAPTER',
        'BACKEND_DECISION',
        'PLANNED',
        'REVIEW_REQUIRED',
      ].map((status) => [
        status,
        results.filter((item) => item.status === status).length,
      ]),
    ),
  }
}

function resolveRoots(env = process.env) {
  const backend = path.resolve(__dirname, '..')
  const parent = path.dirname(backend)
  return {
    backend,
    admin: path.resolve(
      env.KOOKABURRA_ADMIN_DIR || path.join(parent, 'kookaburra-admin'),
    ),
    storefront: path.resolve(
      env.KOOKABURRA_STOREFRONT_DIR ||
        path.join(parent, 'kookaburra-storefront'),
    ),
  }
}

function run(args = process.argv.slice(2)) {
  const result = evaluate(resolveRoots())
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Frontend–Backend Source Alignment Audit v${result.version}`)
    console.log(`Backend:    ${result.roots.backend}`)
    console.log(`Admin:      ${result.roots.admin}`)
    console.log(`Storefront: ${result.roots.storefront}`)
    for (const finding of result.results) {
      console.log(
        `[${finding.status}] [${finding.priority}] ${finding.id}: ${finding.summary}`,
      )
      if (finding.status !== 'MATCH')
        console.log(`    Action: ${finding.action}`)
    }
    console.log(`Counts: ${JSON.stringify(result.totals)}`)
    if (result.missing.length)
      console.log(`Missing project files: ${result.missing.join(', ')}`)
    console.log(
      'Source inspection only; NO frontend live API integration or PostgreSQL test was executed.',
    )
  }
  const p0 = result.results.filter(
    (f) => f.priority === 'P0' && f.status !== 'MATCH',
  )
  if (
    result.missing.length ||
    result.results.some((f) => f.status === 'REVIEW_REQUIRED')
  )
    return 1
  if (args.includes('--strict') && p0.length) return 2
  return 0
}

module.exports = { evaluate, resolveRoots, run }
if (require.main === module) process.exitCode = run()
