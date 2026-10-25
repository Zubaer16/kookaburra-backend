# Phase 03B — Inventory ledger, atomic adjustments & test coverage

Baseline: `kookaburra-backend-full-20261025-194420.zip`. This patch is
incremental: it retains Auth/Catalog HTTP contracts and does not alter either
Next.js frontend. No payments, reservations, order stock consumption or media
storage are implemented in this milestone.

## API endpoints (existing `/v1` prefix)

All five routes require an access JWT with Admin panel access. OWNER/ADMIN may
write; STAFF may read only; CUSTOMER/unauthenticated callers are rejected.

- `GET /v1/admin/inventory?page=1&limit=20&lowStock=true` — paginated active SKU balances.
- `GET /v1/admin/inventory/{id}` — one SKU inventory item (balance UUID).
- `GET /v1/admin/inventory/{id}/movements?page=1&limit=20` — audit ledger.
- `PATCH /v1/admin/inventory/{id}/threshold` — `{ "lowStockThreshold": 3 }`.
- `POST /v1/admin/inventory/{id}/adjustments` — `{ "requestId": "UUID", "delta": 10, "reason": "RECEIPT", "note": "Delivery" }`.

Use `delta > 0` for RECEIPT/RETURN, `delta < 0` for DAMAGE, and either signed
nonzero delta for CORRECTION. Quantity must be a signed integer within INT32.
Use a new UUID on a new adjustment. **Retain the same UUID when retrying**
after a timeout: a matching retry returns the original movement and
`replayed: true`; reusing it with different reason, delta or note gives 409.
Note that on a replay `inventory` reports _current_ stock while `movement`
retains the original before/after snapshot.

Stock never drops below zero or exceeds PostgreSQL INT32. This is enforced
using a conditional atomic `UPDATE`, not read-then-write. Failed operations
are rolled back including mirror/ledger/audit changes. `stockOnHand` remains
in Catalog JSON responses for frontend compatibility, but changing stock via
Catalog PATCH is now rejected; use Inventory adjustments.

## Schema and migration

`20261025200000_phase03b_inventory` creates `inventory_balances` and
`inventory_movements`; indexes, positive constraints, one-target constraint,
unique `(balance_id, request_id)` idempotency and audit history. Existing
product and variant `stock_on_hand` values are copied to opening balances;
for positive historical stock an opening movement is created. **Existing
Catalog products, IDs and displayed stock are not overwritten.**

For products with variants the simple-product balance is retained at zero for
history, but hidden from active inventory lists; variant stock is canonical.
Only a DRAFT zero-stock variant with no movements can be removed through the
Catalog API. Product archive is non-destructive. Physical FK cascading deletes
can remove inventory history and are not available through normal product
archive API: restrict privileged direct DB deletion in production and plan
retention rules before future order/fulfilment implementation.

**Local migration order:**

1. Back up `kookaburra-api-dev` and confirm `.env` points to it; do not reset.
2. `npm run db:validate` then `npm run db:deploy` (development DB only).
3. `npm run test:api:db:deploy` (isolated `kookaburra_api_test`).
4. `npm run check`.
5. `npm run test:api:smoke`.
6. `npm run test:api:db`.
7. `npm run test:api:security`.
8. `npm run test:api:visual:smoke`.
9. `npm run test:api:visual:all` (requires Playwright Chromium).

`npm run db:deploy` and `npm run test:api:db:deploy` are deliberately separate:
the second has local-host/database-name safeguards in
`scripts/run-api-tests.cjs`. Never use `prisma migrate reset`, run destructive
API testing on the development DB, or send credentials into ChatGPT.

## Test coverage added

- Jest DTO tests: UUID, signed delta, reason, threshold/pagination boundaries.
- Playwright HTTP/real DB: opening stock, backfilled schema, balances, threshold,
  positive/negative adjustments, idempotent retry, audit ledger, Catalog
  bypass denial, concurrency/overselling, variant isolation.
- Dedicated Playwright security: missing/expired/invalid JWT, CUSTOMER/STAFF
  isolation, mass assignment, invalid payloads, bad direction, no side effects.
- Chromium Swagger UI: five endpoints executed via Try it out/Execute,
  successful and rejected requests, RBAC, idempotency and DB assertions.
- API smoke: new OpenAPI paths, tags, auth declarations and DTO schema.
- Swagger visual smoke: two Inventory unauthorized checks without DB.

**Verification caveat:** Tests are provided as code, but full Node 24,
Prisma generation and PostgreSQL/Chromium execution must be run locally.
Check the actual command output before considering Phase 03B accepted.
