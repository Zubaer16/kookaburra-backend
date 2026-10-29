# KOOKABURRA V2 — G1 / Phase 04D-2B-2: Protected tracking timeline

**Patch:** `KOOKABURRA_G1_PHASE04D2B2_OVERLAY.tar.gz`  
**Source baseline:** `kookaburra-backend-full-20261029-123339.zip` (321 files; previous 04D-2B-1 replacement source present).  
**Status:** SOURCE IMPLEMENTED / STATIC PARSE CHECKED; WINDOWS API/DB/CHROMIUM ACCEPTANCE PENDING. G1 gate remains OPEN.

## Scope and exclusions

- Adds **read-only** owned customer and staff/OWNER tracking projections for one canonical order **UUID** under the existing `/v1` JWT REST API.
- Routes: `GET /v1/orders/:id/tracking` (CUSTOMER + ownership, 404 for absent/other-customer UUID) and `GET /v1/admin/orders/:id/tracking` (authorized `orders.manage` staff/OWNER). Both require Bearer JWT; unauthenticated 401, wrong role 403.
- Returns `orderId`, `orderStatus`, `originalShipment`, `returns`, `replacements` and a stable chronological `events` array. Reads order, original shipping history, inspected return history, and non-financial replacement actions using one PostgreSQL REPEATABLE READ snapshot. No payment details, addresses, customer identifiers, staff identifiers, request hashes or free-form return reasons are projected.
- No public order-number lookup or anonymous tracking; Storefront's current tracking page is **sample-only**. The future Storefront adapter must use the authenticated account's **real order UUID** and surface shipment/replacement as separate parcels. This patch does **not** link a carrier service, send tracking notifications, create a paid exchange order, authorize refunds, modify stock, or change order/return/replacement transitions.
- No database schema change and **no new Prisma migration**. Existing 04D-2B-1 migration remains in the owner-provided ZIP and must not be modified or re-applied manually.
- Source files: `tracking.controller.ts`, `tracking.dto.ts`, `tracking.service.ts`, module registration. Tests: deterministic unit timeline, strict OpenAPI smoke, real PostgreSQL customer-ownership/return/replacement integration, role/UUID security, focused Swagger Chromium Execute. Adds `test:api:visual:tracking` guard-mode command.

## Apply (PowerShell, repo root)

Review expected local changes and verify LOCAL dev/test DB targets and available fresh backups before touching files. This is a root-relative overlay; it may replace `package.json`, the test launcher and `src/orders/orders.module.ts`.

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
git status --short
tar -tzf "$env:USERPROFILE\Downloads\KOOKABURRA_G1_PHASE04D2B2_OVERLAY.tar.gz"
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G1_PHASE04D2B2_OVERLAY.tar.gz" -C .
```

## Run in order (only after confirming dev/test DB identity)

```powershell
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

npm run test:api:visual:tracking
npm run test:api:visual:replacements
npm run test:api:visual:returns
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

**Stop if any command FAILS**; do not bypass tests, reset databases, alter previous migrations, or call this release-accepted without actual Windows evidence. The `db:deploy` commands should report no new 04D-2B-2 migration. Before future DB-writing phases, take verified dev/test DB backups.

## Acceptance / handoff

Confirm correct Swagger security and `200` schema, ownership 404, unauthorized/role 401/403, invalid UUID 400, stable timeline event chronology, real return and replacement shipment statuses, no PII leakage. Retain actual local outputs and updated full backend ZIP. Owner says prior G1-1 tests passed; raw logs/results were not supplied with this ZIP, and this patch is not an independently verified Windows pass.

**G1 remaining contract review:** authenticated order-number vs UUID UX; Admin cancellation policy; cross-SKU order/price/tax/shipping exchanges; mixed refund/replacement partial-line recovery; advanced partial shipment/return carrier integration. Backend G1 is not closed by this read-only increment; do not begin G2 solely on source presence.
