# 04B-2 — Atomic customer inventory reservation (backend only)

Baseline: `kookaburra-backend-full-20261027-193743.zip` after 04B-1 Codex acceptance. This patch has **no order, payment, payable checkout, address-level tax, shipment booking or Stripe integration**.

## Endpoints (CUSTOMER JWT)

- `POST /v1/checkout/reservations` body `{"requestId":"<UUID>","countryCode":"US"}`. Returns HTTP 200 and a **10-minute** snapshot (country, currency, merchandise subtotal, tax estimate, shipping estimate, units held, expiry timestamp, `payable:false`). Same customer/UUID/country retry returns the same record without increasing reserved stock. A different country for that UUID returns 409. Requires an enabled OWNER-maintained country/currency rate.
- `GET /v1/checkout/reservations/:id` checks customer ownership, lazily expires holds when needed, returns 200 or 404.
- `DELETE /v1/checkout/reservations/:id` idempotently releases held units and returns record with RELEASED/EXPIRED. Only owning CUSTOMER may call it.

InventoryBalance tracks `reservedQuantity` alongside `onHand`, while Admin Inventory GET now includes `reservedQuantity` and `availableQuantity`. Cart quotes and cart item selection use `onHand - reservedQuantity`. Inventory adjustment SQL checks that on-hand after decrement never falls below the held quantity. Physical stock and mirrored Product/ProductVariant stock do not change on reservation/release, and no inventory movement is recorded for a hold.

## Transaction and concurrency guarantees

- Cart row lock serializes hold creation against cart updates and anonymous merge. Cart editing/merge is rejected while active hold exists. Users can explicitly release; expired hold also releases on GET/reserve, or through the scheduled worker.
- Guarded atomic balance-row UPDATEs serialize reservation requests for competing customers. Multi-SKU updates are ordered by balance UUID; entire transaction rolls back if any SKU cannot be reserved, ensuring no partial holds.
- Partial unique index limits a cart to one ACTIVE hold; unique `(customerId, requestId)` implements retry identity. Reservations preserve server-side prices and configured estimate values as **historical snapshots**, not as payable amounts. Rates or catalog may change later.
- Both manual and automatic expiry lock reservation rows before changing stock counters. No double decrement on retries or concurrent sweepers; PostgreSQL SKIP LOCKED selects bounded expiry batches.
- Database constraints prevent `reservedQuantity > onHand`, negative reserved stock, and premature balance deletion while any reservation line exists. User/cart deletes are RESTRICTed while reservation records remain; a future order-retention policy must define lifecycle before relaxing these rules.

## Operations

- Migration `20261027211000_phase04b2_reservation_hold` is additive, non-seeding. Back up development and isolated test PostgreSQL databases before deployment.
- Run `npm run checkout:expire` periodically (for example, Windows Task Scheduler every minute) on each client instance. This command **updates the configured database**, so verify `DATABASE_URL` before scheduling. The command processes at most 5,000 expirations per invocation (100 × 50) and logs a count without leaking customer data. If no scheduler runs, expired holds can temporarily reduce public availability until lazy/next release.
- The 10-minute TTL is a bounded stock hold, **not** a cart/order/payment guarantee. Do not collect payments or promise fulfilment against it. Address-specific tax/ship rates, order creation and payment authorization require later phases.
- If a customer has an ACTIVE reservation, release it before editing/merging their cart. If an expired hold has not yet been reaped, GET reservation or run expiry worker.

## Acceptance gates

Run `npm run db:generate`, `npm run db:validate`, `npm run db:status` (pending migration expected before deploy), `npm run db:deploy`, `npm run test:api:db:deploy`, then `npm run check`, `npm run test:api:smoke`, `npm run test:api:db`, `npm run test:api:security`, `npm run test:api:visual:reservation`, `npm run test:api:visual:all`, `npm run alignment:audit`, `npm run alignment:test`. Real Node 24/PostgreSQL/Chromium acceptance not verified by the patch author here.
