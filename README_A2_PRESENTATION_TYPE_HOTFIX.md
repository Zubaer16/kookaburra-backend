# Kookaburra Backend — Alignment A2 Catalog Presentation Type Hotfix

## Symptom

`npm run check` fails at `src/catalog/catalog.presentation.spec.ts` because TypeScript sees a variant as its original input type and does not recognize the added `available` property.

## Fix

`presentCatalogProduct` now destructures variants before spreading the other generic product fields. It explicitly represents the projected variant shape as the original variant fields plus `available` and effective `price`. The production JSON output is unchanged. A regression assertion verifies original variant IDs are still retained.

## Files

- `src/catalog/catalog.presentation.ts`
- `src/catalog/catalog.presentation.spec.ts`

## PowerShell

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-a2-catalog-presentation-type-hotfix-20261025.tar.gz" -C .
npm run check
```

If full check succeeds, run the database, security and Swagger Chromium suites as usual (after the Phase A2 test database migration):

```powershell
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
```

No Prisma migration or database reset is necessary for this hotfix. Do not run destructive database reset commands.

## Verification scope

Targeted TypeScript type inference has been checked with local `tsc` (global TypeScript 5.8.3). The full project check, actual PostgreSQL and Swagger UI browser suites have not been executed here.
