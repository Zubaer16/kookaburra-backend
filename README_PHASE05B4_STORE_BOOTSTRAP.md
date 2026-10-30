# G3 / 05B-4 — Public Store Bootstrap (incremental overlay)

**Exact source baseline:** `kookaburra-backend-full-20261030-223819.zip` (433 archive entries). G3/05B-3 StoreBranding and its `20261030221000_phase05b3_store_branding_media` migration already exist. **Do not reapply older patches.**

## Scope

`GET /v1/store/bootstrap` is a public, `Cache-Control: no-store`, read-only composite of **existing** approved G3 public APIs. Output: `schemaVersion: 1`, `profile`, `content`, `branding`. Every nested object retains its own explicit `configured` state. Each field is explicitly allowlisted. Logo/favicon are the verified media public projection, never provider credentials or arbitrary URL input. It adds no public write endpoint. OWNER-only originals remain guarded.

The composite intentionally **does not** mutate/read money/stock/reservations, change CORS/redirect policy, expose admin revisions or consume mock IDs. Concurrent Admin edits may mean the three read projections momentarily reflect different revisions; this is non-financial presentation data, not a transactional snapshot. For strict per-document revisions, use the existing protected Admin endpoints.

**Prisma migration:** None required; schema and old migrations remain unmodified. No database reset. No frontend integration delivered. It does not complete the G3 gate or resolve international shipping-zone/service/tax, locale/currency choices, order reference prefix, domain/allowed-origin controls, feature flags or guest checkout boundaries.

## Commands (PowerShell, Backend repository root)

```powershell
# After you have independently verified the downloaded patch file:
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G3_PHASE05B4_STORE_BOOTSTRAP_OVERLAY.tar.gz" -C .

npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run db:status
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:store-bootstrap
npm run test:api:visual:store-branding
npm run test:api:visual:store-content
npm run test:api:visual:store-profile
npm run test:api:visual:all
$env:KOOKABURRA_ADMIN_DIR = 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-admin'
$env:KOOKABURRA_STOREFRONT_DIR = 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-storefront'
npm run alignment:audit
npm run alignment:test
```

**Safety:** Check dev/test DB identities before any `db:deploy` (even though there is no new migration). Keep both databases backed up before accepting a new phase; never point API tests at live, remote or development DB. Avoid destructive Prisma reset. Node 24 as required by `package.json`.

## Tests

- Jest: safe allowlist, error propagation.
- OpenAPI/API smoke: strictly documented public GET-only response and no bearer.
- PostgreSQL: profile and content rows reflected live; cross-check against all three individual public routes; restoration in `finally`.
- Security: forbidden writes, no sensitive fields, existing Admin endpoints still JWT/OWNER protected.
- Swagger UI Chromium: real Try it out → Execute on the public composite and protected Admin endpoint.
- Alignment tests: existing 2/2 source-level tests. No web UI integration asserted.

**Source prepared; Windows PostgreSQL/full Jest/Chromium acceptance PENDING.** The owner's `done` for previous G3/05B-3 is owner-reported only (no raw suite logs uploaded). This patch is not G3 gate PASS or G12 RC.
