# Kookaburra backend — Phase 03B Swagger enum/select hotfix

Baseline: `kookaburra-backend-full-20261025-231106.zip`.

## Changes

- `swagger-ui-tests/swagger-helper.ts`: pick `selectOption()` for Swagger-generated HTML `select` parameters; preserve `.fill()` for text controls. This fixes `lowStock=true` query parameter in Inventory Swagger UI.
- `swagger-ui-tests/all-endpoints.smoke.spec.ts`: add Chromium Swagger UI regression checks for both `lowStock=true` and `lowStock=false`; both intentionally return HTTP 401 without token and do not write to DB.

No NestJS backend, Prisma schema, migration, .env, JWT or API contract changes.

## Apply from the repository root

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03b-swagger-select-hotfix-20261025.tar.gz" -C .
```

## Verify

```powershell
npm run check
npm run test:api:visual:smoke
npm run test:api:visual:all
```

The smoke test is database-independent. `visual:all` requires the isolated local `kookaburra_api_test` database and its already-applied migrations. Do not point it at `kookaburra-api-dev`.

Only TS syntax and archive integrity were checked in the patch authoring environment. The tests above must be run in the local Windows environment.
