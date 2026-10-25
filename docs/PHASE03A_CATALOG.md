# Phase 03A — Catalog API (incremental patch, 25 October 2026)

## Scope and status

This patch adds versioned catalog routes to the existing NestJS `/v1` API without changing the existing authentication endpoints, test launcher safety checks, or frontend repositories. It includes an additive Prisma migration, DTO validation, authorization guards, transactionally written audit events, unit tests, and an isolated real-PostgreSQL Playwright test.

**Validation status:** Archive integrity and TypeScript _syntax_ were checked in the patch-build environment. The full `npm run check`, Prisma migration, and DB-backed Playwright tests were **not** run here because the required Node 24/npm dependencies and the user's local PostgreSQL are not available. Validate on your Windows machine before committing/deploying.

## Endpoints

### Public (no auth)

- `GET /v1/categories` — all category nodes; reconstruct hierarchy with `parentId`.
- `GET /v1/products?page=1&limit=20&search=...&category=...` — only `ACTIVE` products, with category slug filter, newest first. `category` matches directly linked products, not all descendants.
- `GET /v1/products/:slug` — `ACTIVE` product only; archived and draft return 404.

### Admin (JWT auth)

- `GET /v1/admin/categories`, `GET /v1/admin/products`, `GET /v1/admin/products/:id` — OWNER, ADMIN, STAFF.
- `POST/PATCH/DELETE /v1/admin/categories[/:id]` — OWNER, ADMIN. DELETE blocks category with children/products.
- `POST/PATCH /v1/admin/products[/:id]` — OWNER, ADMIN. Product PATCH does **not** accept `variants` to avoid accidental replace.
- `DELETE /v1/admin/products/:id` — archives; never physically deletes a product.
- `POST /v1/admin/products/:id/variants` — add variant.
- `PATCH/DELETE /v1/admin/products/:id/variants/:variantId` — update/delete variant. Deletion is restricted to a zero-stock variant on a draft product, since order references will arrive in later phases.

_Phase 02 has role-only auth, not a persisted permission matrix. The temporary catalog policy deliberately gives STAFF read-only access and OWNER/ADMIN write access._

### Minimal product JSON

```json
{
  "title": "Sample Headphones",
  "slug": "sample-headphones",
  "sku": "HEADPHONES-001",
  "priceMinor": 12999,
  "currency": "USD",
  "status": "DRAFT",
  "categoryIds": ["REPLACE-WITH-EXISTING-CATEGORY-UUID"],
  "variants": [
    {
      "sku": "HEADPHONES-001-BLACK",
      "options": { "color": "Black" },
      "stockOnHand": 0
    }
  ]
}
```

Currency stays USD by default; prices are integer minor units, not floating point dollars. Product SKU is normalized to uppercase. Each variant must have unique size/color pair; variants are stored under the existing `ProductVariant.options` JSON column. Products with variants keep the simple-product `stockOnHand` at zero. Stock changes will move to the inventory ledger in Phase 03B; do not treat current stock mutations as final commerce-safe inventory implementation.

## Database migration safety

New migration: `prisma/migrations/20261025130000_phase03a_catalog/migration.sql`.

Only **additive** changes:

- `categories.description` — text with default `''`.
- `products.sku` — nullable in DB to preserve older rows, **required for new API-created products**.
- `products.compare_at_minor` — nullable, constrained to be greater than `price_minor` when set.
- Unique index on `products.sku`.

Do not reset either DB, drop tables, or import demo fixtures. Review and back up your **local dev** DB before `npm run db:deploy`. Run the migration in local `kookaburra_api_test` separately using the guarded `npm run test:api:db:deploy` runner. Existing `kookaburra-api-dev` and `kookaburra_api_test` database names are intentionally unchanged.

## Local validation order (Windows PowerShell)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
node --version               # v24.11+ required by current package.json
npm ci
npm run db:generate
npm run db:validate
npm run check                # unit, lint, typecheck, build and health E2E

# MANUALLY confirm .env and DIRECT_URL target only your local development PostgreSQL.
# Back up kookaburra-api-dev first (using pg_dump or your existing backup process).
npm run db:status
npm run db:deploy

# Separate isolated test DB; verify .env.api-test points to local kookaburra_api_test.
npm run test:api:db:deploy
npm run test:api:db         # runs Phase 02 auth tests AND new Phase 03A catalog test
npm run test:api:security   # prior credentials issue must be fixed before it can pass
```

A test authentication failure such as `Authentication failed ... for postgres` points to `.env.api-test` or an overriding `API_TEST_DATABASE_URL` environment variable, **not** necessarily to 16 separate API security defects. The runner prevents nonlocal/incorrect test-DB names but cannot supply credentials for you.

## Deferred acceptance gates (before production)

- Add stock movement ledger, reservation/adjustment rules and immutable inventory history (Phase 03B).
- Add media IDs, provider adapters, safe reference deletion, outbox retries/reconciliation (Phase 03C).
- Replace coarse catalog role policy with persisted backend permission checks.
- When orders reference variants, permanently prevent destructive variant deletion and use an archive/history lifecycle instead.
- Add concurrent cross-table SKU uniqueness enforcement (currently application checked; unique DB indexes cover product and variant tables _separately_).
- Add concurrency-tested cycle prevention for category reparenting.
- Frontends must remain unchanged until API contracts and end-to-end tests are accepted; old fixture IDs do not become production IDs.

## Phase 03A startup and smoke-test hotfix (25 October 2026)

The original Phase 03A patch added `@UseGuards(AccessGuard, AdminGuard)` to the
Catalog controller, but `AuthModule` did not re-export the `JwtModule` provider
needed for Nest to instantiate that guard in the Catalog module context. This
caused `UnknownDependenciesException: AccessGuard (JwtService, ...)` at startup.

The hotfix re-exports `JwtModule` from `AuthModule` while keeping the existing
JWT validation and Admin/Catalog write policies unchanged. It also updates
stale smoke tests and the Swagger tag order for the newly implemented catalog
routes. The no-database smoke tests check the published catalog contract,
unauthenticated Admin catalog rejection and invalid public catalog query
validation; they do not attempt real product reads without PostgreSQL.

The hotfix has **no Prisma migration, package/dependency change, database reset,
or frontend change**. Run `npm run check` and then `npm run test:api:smoke`.
For the DB-backed catalog test, use the existing locally isolated test-database
workflow only after verifying its `.env.api-test` credentials.
