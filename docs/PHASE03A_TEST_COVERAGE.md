# Phase 03A Catalog — Test Coverage Enhancement (25 October 2026)

Baseline: `kookaburra-backend-full-20261025-181256.zip`. This patch is **test-only**: no production controllers/services, database schema, Prisma migrations, frontend repos, or dependencies were modified.

## Added / revised tests

| Scope                      | New/updated test                             | What it checks                                                                                                                                                           |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Swagger Chromium           | `swagger-ui-tests/catalog.db.spec.ts`        | **All 15 Catalog operations** via Swagger **Try it out → Execute**, including GET/POST/PATCH/DELETE, path/query inputs, response status and DB verification              |
| Swagger Chromium negatives | same file                                    | No bearer and bad bearer (401), STAFF and CUSTOMER (403), invalid/boundary data (400), duplicate SKU (409), no DB side effects                                           |
| Dedicated HTTP security    | `api-tests/catalog.security.spec.ts`         | All 12 Admin routes require a bearer token; role-write restrictions, malformed JSON, boundaries, forbidden mass assignment, constraints, rollback and audit non-creation |
| OpenAPI contract (no DB)   | `api-tests/catalog.contract.smoke.spec.ts`   | Complete 15-operation inventory, Public/Admin Swagger tags and bearer scheme, DTO schemas, path/query parameters                                                         |
| No-DB validation           | `api-tests/catalog.validation.smoke.spec.ts` | Public query bounds and Admin unauthenticated rejection without opening PostgreSQL                                                                                       |
| Shared safe fixture        | `api-tests/catalog-test-support.ts`          | Local `kookaburra_api_test` only; randomized account/product/category namespaces; scoped cleanup                                                                         |
| Swagger execution helper   | `swagger-ui-tests/swagger-helper.ts`         | PATCH/PUT/DELETE, `{id}`/`{variantId}` path params, query params, real network + UI assertions; existing Phase 02 tests remain compatible                                |

The original Phase 02 visual, API and authentication security tests are **preserved**. Existing npm scripts automatically discover the new files via `.smoke.spec.ts`, `.db.spec.ts`, and `.security.spec.ts` suffixes.

## Acceptance / test matrix

| Category             | Coverage                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positive             | Public category/product listing, slug detail; authorized Admin category/product/variant create/read/update/delete/archive                                               |
| Negative             | Missing/invalid JWT, invalid type, empty/oversized title, invalid SKU, category references, unknown extra fields, malformed JSON                                        |
| Boundary             | Page=0, limit=101, negative/fractional/overflowing price, invalid product stock                                                                                         |
| Authorization        | CUSTOMER 403, STAFF read-only, OWNER write; unauthenticated Admin 401                                                                                                   |
| Business rules       | Duplicate product SKU/slug; duplicate variant option combination; compare-at below selling price; category cycle and delete-with-children; active-variant delete denied |
| Database consistency | Rejected operations leave test records unchanged, rollback and audit checks, archived product not public                                                                |
| Swagger contract     | 15 Catalog operations, correct tag/auth/route/path/query/DTO schema references                                                                                          |
| Regression           | Original auth/security tests and original visual test remain; no migration needed                                                                                       |

Coverage **is not** a penetration test, full concurrency proof or a production release certification. Only Phase 03A APIs are covered, not pending Inventory/Media/Payment APIs. A few classes of malformed requests cannot be entered via Swagger UI and are therefore checked with direct HTTP tests.

## Windows PowerShell — apply patch

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
# Change the archive filename if downloaded with a browser-added suffix.
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03a-test-coverage-20261025.tar.gz" -C .
```

## Windows PowerShell — verify

```powershell
node --version # Expect Node 24.11+ per package.json
npm run check
npm run test:api:smoke
# Existing test database needs to be migrated; no DB reset.
npm run test:api:db:deploy
npm run test:api:db
npm run test:api:security
npx playwright install chromium
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run test:api:visual:report
```

Before running DB tests, check `.env.api-test` contains **only** your isolated local `API_TEST_DATABASE_URL` pointing to `kookaburra_api_test`; it must not be your development database `kookaburra-api-dev`. Port 4101 must be free. Visual Chromium tests are headed; they open real Swagger UI and can take several minutes. If an unexpected crash interrupts cleanup, only the isolated test database can contain residual `qa-<random>-` fixtures; never bulk-delete unrelated rows.

**Verification honesty:** These tests have been authored and locally syntax-checked for distribution. The full test suite is NOT marked passed until run under Node 24 with installed dependencies, Chromium, and the user's isolated local PostgreSQL. Share any failing logs for a targeted fix.
