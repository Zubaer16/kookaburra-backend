# A2 Swagger inventory UUID browser-test fix — 26 October 2026

## Baseline

Backend: `kookaburra-backend-full-20261026-101245.zip` with `kookaburra-backend-a2-swagger-timeout-hotfix-20261026.tar.gz` already applied.

## Failure

`test:api:visual:all` showed five passing tests and one A2 failure at `swagger-ui-tests/a2.alignment.db.spec.ts:116`: no matching response after Swagger Execute for `/v1/admin/inventory?productId=invalid-uuid`. OpenAPI documents `productId` as `format: uuid`. Swagger UI can stop an invalid-format parameter before sending an HTTP request, so the browser helper cannot observe the expected HTTP 400.

## Change

- Run a **real Swagger UI** lookup with a correctly formatted but nonexistent random UUID, expecting HTTP 200 and an empty inventory list.
- Retain **invalid UUID rejection** through a real Playwright API HTTP call using the same authenticated owner and isolated test database, expecting HTTP 400 and a safe error payload.
- The existing dedicated A2 security suite already tests invalid UUID rejection. This visual-suite fallback makes the boundary explicit without bypassing the Swagger UI for inputs it supports.

No controller, DTO, Swagger/OpenAPI, authentication, migration, database schema or frontend change. No tests skipped or deleted.

## Apply on Windows

```
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-a2-swagger-inventory-uuid-hotfix-20261026.tar.gz" -C .
```

## Verify

```
npm run check
npm run test:api:visual:all
npm run test:api:security
```

This fix was statically inspected and TypeScript-syntax checked; it has not been executed against local PostgreSQL/Chromium here. A full passing local run is required for acceptance.
