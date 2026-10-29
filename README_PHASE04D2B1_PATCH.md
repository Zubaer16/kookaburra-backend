# Phase 04D-2B-1 / G1 — same-SKU replacement recovery (incremental patch)

**Source baseline:** `kookaburra-backend-full-20261029-095645.zip` (includes 04D-2A). **Status:** IMPLEMENTED IN OVERLAY / ACCEPTANCE PENDING. This is a _bounded first G1 increment_, **not G1 completion** or Backend RC.

## Contract and safety

- Keep original PAID Order, financial snapshots, paymentTransaction, refund ledger, shipment and return inspection history immutable.
- After verified PAID + DELIVERED order and physically inspected original return, OWNER or authorized `orders.manage` staff may authorize **one free same-original-SKU replacement document** (`OrderReplacement`), quantity exactly the inspected return quantity. Not a new paid `Order` and not a cross-SKU price-changing exchange.
- State: `AUTHORIZED` -> `SHIPPED` -> `DELIVERED` or `AUTHORIZED` -> `CANCELLED`. A cancelled authorization is not reissued automatically. Customer can read only their own order's replacement/tracking status; no public order-number tracking API.
- Authorization and cancellation do not reserve, restock or deduct units. Shipping uses original Product/Variant identity + SKU snapshot, requires active product, carrier and tracking, and uses a transaction-safe `on_hand - reserved_quantity >= quantity` conditional UPDATE. Only once per successful dispatch, with inventory mirror and `REPLACEMENT` movement in the same transaction. Late stock changes can cause 409 at dispatch; there is **no pre-dispatch hold**.
- Order row locking serializes authorization, dispatch and `RefundLedgerService.create`. Existing ANY refund request blocks authorization/dispatch; an active or dispatched replacement blocks fresh refund ledger requests. This is conservative at order scope (not line-level) and requires manual review for mixed recoveries. No automatic Stripe refund, settlement, original return restock, customer charging or new paid order.
- Audit events and durable outbox events contain identifiers/status, not payment credentials/PII. No optional cloud provider is contacted.

## New endpoints (JWT Bearer, `/v1`)

Customer (CUSTOMER + owned order):

- `GET /v1/orders/:id/replacements`

Admin (OWNER or `orders.manage`):

- `GET /v1/admin/orders/:id/replacements`
- `POST /v1/admin/orders/:id/replacements/returns/:returnId/authorize` with `{ "requestId": "<UUID>" }`
- `POST /v1/admin/orders/:id/replacements/:replacementId/ship` with `{ "requestId": "<UUID>", "carrier": "DHL", "trackingNumber": "REPL123456" }`
- `POST /v1/admin/orders/:id/replacements/:replacementId/deliver` with `{ "requestId": "<UUID>" }`
- `POST /v1/admin/orders/:id/replacements/:replacementId/cancel` with `{ "requestId": "<UUID>" }` (pre-dispatch only)

All admin mutations require new caller-provided idempotency UUIDs, exact retry allowed; reused UUID with different payload rejected. Replacements cannot be authorized for a `REQUESTED`, `APPROVED` or `REJECTED` return. No client price/stock/payment status or replacement SKU is accepted. A `RECEIVED_DAMAGED` return may have a separately fulfilled replacement, but it never restocks damaged goods.

## New migration

`prisma/migrations/20261029121500_phase04d2b1_same_sku_replacements/migration.sql` creates `ReplacementStatus`, `OrderReplacement`, action events and indexes and adds `REPLACEMENT` inventory reason. **Additive only.** DO NOT edit old migrations or reset a database. Reconcile database/prisma version and verify backups before applying. SQL schema status/uniqueness constraints are in migration.

## PowerShell (Windows) — inspect, BACKUP, then apply

Run in an Administrator-controlled local development environment, not Neon/production. PostgreSQL tools (`psql` and `pg_dump`) must be in `PATH`; adjust `-U` to your local DB user. This script **does not auto-apply** anything until the explicit `tar -xzf` command. Do not paste database passwords into a transcript.

```powershell
$repo = 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend'
$patch = Join-Path $env:USERPROFILE 'Downloads\KOOKABURRA_G1_PHASE04D2B1_OVERLAY.tar.gz'
$pgUser = Read-Host 'Local PostgreSQL username'
$backups = Join-Path $env:USERPROFILE ('Desktop\kookaburra-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backups | Out-Null
Set-Location $repo
if (!(Test-Path $patch)) { throw "Patch not found: $patch" }
$target = node -r dotenv/config -e "const u=new URL(process.env.DIRECT_URL||process.env.DATABASE_URL||'');if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||decodeURIComponent(u.pathname.slice(1))!=='kookaburra-api-dev')process.exit(2);console.log('LOCAL DEV URL VERIFIED')"
if ($LASTEXITCODE -ne 0) { throw 'Unsafe Prisma migration DB target; STOP' }
$devName = (psql -h localhost -U $pgUser -d kookaburra-api-dev -Atc 'SELECT current_database()').Trim()
if ($LASTEXITCODE -ne 0 -or $devName -ne 'kookaburra-api-dev') { throw 'Development DB identity mismatch' }
$testName = (psql -h localhost -U $pgUser -d kookaburra_api_test -Atc 'SELECT current_database()').Trim()
if ($LASTEXITCODE -ne 0 -or $testName -ne 'kookaburra_api_test') { throw 'Test DB identity mismatch' }
$devBackup = Join-Path $backups 'kookaburra-api-dev.dump'
$testBackup = Join-Path $backups 'kookaburra_api_test.dump'
pg_dump -h localhost -U $pgUser -Fc -d kookaburra-api-dev -f $devBackup
if ($LASTEXITCODE -ne 0 -or (Get-Item $devBackup).Length -lt 1024) { throw 'Development backup FAILED; STOP' }
pg_dump -h localhost -U $pgUser -Fc -d kookaburra_api_test -f $testBackup
if ($LASTEXITCODE -ne 0 -or (Get-Item $testBackup).Length -lt 1024) { throw 'Test backup FAILED; STOP' }
Write-Host "Backups created: $backups"
tar -tzf $patch
if ($LASTEXITCODE -ne 0) { throw 'Unreadable overlay; STOP' }
# Confirm clean/expected tracked work before replacing files.
git status --short
# The tar entries are repo-root-relative (src/, prisma/, api-tests/, etc.).
tar -xzf $patch -C $repo
if ($LASTEXITCODE -ne 0) { throw 'Patch extraction failed' }
# Dependencies should already match package-lock; npm ci changes no app data.
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed; STOP' }
npm run db:generate
npm run db:validate
npm run db:status
# Before deployment the preceding status is expected to show one pending G1 migration.
npm run db:deploy
if ($LASTEXITCODE -ne 0) { throw 'Development DB migration failed; STOP' }
npm run db:status
# Separate API_TEST_DATABASE_URL must target LOCAL kookaburra_api_test only.
npm run test:api:db:deploy
if ($LASTEXITCODE -ne 0) { throw 'Test DB migration failed; STOP' }
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:replacements
npm run test:api:visual:returns
npm run test:api:visual:all
npm run alignment:test
```

Run commands from the repository root. Some shell commands above do not stop on a failed test automatically; **check every exit code**, retain complete logs, and do not call the patch accepted if any test fails. `node` version must satisfy `>=24.11.0 <25`, as in the unchanged package manifest. Do **not** run `prisma migrate reset`, remove old migrations, or restore to production.

## Acceptance checks and evidence

1. Prisma generate / validate / migration dev + test DB deploy; clean checksum/status; test DB identity & dated backups.
2. `npm run check` (unit, E2E, typecheck, lint, build). New unit replacement-policy cases.
3. Real DB + negative/security + Swagger strict contract + headed Chromium Try it out -> Execute, plus existing 04D-2A and full regression. New DB test covers pending-inspection block, authorized state, UUID replay and conflict, insufficient unreserved stock, concurrent ship exactly once, mirrored inventory, customer ownership, refund blocking and shipped cancellation block. New security tests cover JWT/RBAC, UUID validation and mass-assignment rejection.
4. If local runner fixes are required: inspect the actual changed files and supply the new full Backend ZIP + logs before acceptance. Raw Windows DB / Chromium logs were not available in this environment; external Stripe TEST flows are **NOT** claimed validated.

## Still open in G1 / contract decisions

- True cross-SKU exchange/replacement **Order** creation, differential pricing/tax/shipping, carrier return labels, partial shipments and provider-handled reshipments are not implemented; need explicit safe business contract before scope expansion.
- Admin paid/unpaid order cancellation beyond existing customer pending-only cancellation remains a reviewed contract gap; do not silently add a paid-order cancellation route.
- Authenticated order-number tracking and customer UX pending integration (current customer read is by owned UUID).
- Whether to permit simultaneous independent per-line refunds and replacements instead of conservative order-wide lockout needs an approved reconciliation model.
- Full G1 tests and acceptance **PENDING**. Continue G1 as bounded follow-up; do not skip forward to G2 on patch existence alone.
