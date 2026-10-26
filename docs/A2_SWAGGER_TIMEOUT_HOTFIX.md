# Alignment A2 — Swagger Chromium response timeout hotfix

## Why this patch is needed

The A2 Swagger browser test submitted `minPriceMinor=-1` through a documented
numeric query field whose Swagger/OpenAPI minimum is zero. Swagger UI may reject
such a value at the form level without sending an HTTP request, leaving the
Playwright helper waiting for a network response until the entire test timed out.

This patch exercises a **business-rule rejection** through Swagger instead:
`minPriceMinor=3000&maxPriceMinor=1000`, which is individually valid according
to the two OpenAPI numeric constraints but is invalid as a price range. The
API returns HTTP 400 for this combination. This case is already covered by
existing no-database Swagger smoke coverage. The `minPriceMinor=-1` backend
rejection remains covered by the dedicated HTTP security suite.

The shared Swagger helper now uses a 25-second per-request response wait, with
a diagnostic indicating whether a matching-path HTTP response was observed.
It still checks the actual browser network response AND Swagger's displayed
response. It does not ignore failures, increase suite timeouts, or bypass UI.

## Files changed

- `swagger-ui-tests/a2.alignment.db.spec.ts`
- `swagger-ui-tests/swagger-helper.ts`

No backend API, Prisma migration, Swagger/OpenAPI documentation or frontend
files are modified; the documented minimum remains correct.

## Application and verification (Windows PowerShell)

```powershell
cd 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend'
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-a2-swagger-timeout-hotfix-20261026.tar.gz" -C .
npm run check
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run test:api:security
```

The Chromium and local PostgreSQL tests must run on the developer's Windows
machine using the guarded local `kookaburra_api_test` database. No migration
or database reset is needed.
