# Kookaburra Backend Phase 03B — E2E / API Smoke Test Hotfix

**Base:** `kookaburra-backend-full-20261025-194420.zip` plus Phase 03B Inventory patch and Phase 03B TypeScript hotfix. Apply this patch *after* both.

## What changed

- `test/health.e2e-spec.ts`: add the `Inventory / Admin` Swagger tag to the expected order, assert all five Inventory OpenAPI operations and bearer security, and check missing JWT returns HTTP 401 for all five routes.
- `api-tests/system.smoke.spec.ts`: update the expected Swagger tag list, assert all five Inventory paths, and check all five routes return HTTP 401 for unauthenticated callers.

Only test files changed. No application code, Prisma migrations, database records, npm scripts, or auth policy changes.

## Apply in PowerShell (from backend repository root)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03b-e2e-smoke-hotfix-20261025.tar.gz" -C .
npm run check
npm run test:api:smoke
```

## Finish Phase 03B acceptance

The isolated test database must have the Phase 03B migration applied before running DB-connected tests:

```powershell
npm run test:api:db:deploy
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
```

Verification in the authoring environment: patch paths and archive integrity checked. **Full Node 24 / NestJS / PostgreSQL / Chromium tests were not run here** and must be verified locally.

### Phase 03C-3 operator reconciliation

For media lifecycle drift, run `npm run media:reconcile` (read-only). After reviewing the report, `npm run media:reconcile -- --apply` schedules missing/orphan deletion jobs without deleting provider files. See `docs/PHASE03C3_MEDIA_RECONCILIATION.md`.
