# Phase 04C-1 — Unpaid Orders & Reservation Consumption

**Baseline:** `kookaburra-backend-full-20261027-204718.zip` (04B-2 user-validated). This is a backend-only overlay. Storefront/Admin ZIPs are references; their files are not modified.

## Intent & accounting safety

- `POST /v1/orders` uses **CUSTOMER JWT** and a currently ACTIVE, owned, unexpired 04B-2 reservation. Requires **new `requestId` UUID** and nested shipping address.
- Reservation changes `ACTIVE -> CONSUMED`, and a uniquely linked `PENDING_PAYMENT` order is committed in one transaction. One hold can never be converted into two orders. Same `(customerId, requestId, payload)` returns the original order. Different payload with same key -> 409.
- Order stores immutable name/SKU/selected options/quantity/unitPrice, tax/shipping/subtotal/total, customer shipping address snapshot, status history, and transactional outbox event. No live product-dependent item data on GET.
- Critically, **inventory_balances.on_hand and catalog stockOnHand do NOT change**. The original reservation's `reserved_quantity` allocation stays in place while order is `PENDING_PAYMENT`. Available quantity continues to be `on_hand - reserved_quantity` across carts, reservations and admin adjustments.
- Current reserved counter = **ACTIVE 04B-2 reservation lines + lines belonging to `PENDING_PAYMENT` orders whose reservation is CONSUMED**. Do not use the old `ACTIVE reservations only` invariant check after deploying this phase.
- Customer `POST /v1/orders/{id}/cancel` or payment-deadline expiry releases the allocation transactionally, idempotently, without a physical stock movement or refund. The unpaid deadline is currently **20 minutes** from creation. Existing operator command `npm run checkout:expire` now releases both expired *unconsumed* reservations and overdue *unpaid* order allocations.
- This is an **unpaid order intent**, not a paid/fulfillable order. `payable:false` in every response: no Stripe, captured payment, fulfillment, receipt or financial recognition here. Do **not** enable real payments or shipments until address-specific rate validation, payment state machine and webhook-consistent physical inventory transitions are delivered in Phase 04C-2 and later.
- Country-level configured charges are intentionally provisional; no taxes/shipping are claimed legally correct for every address. Order request does not accept client prices/totals. Do not treat this as production-compliant international checkout.
- Response contains customer's shipping PII, so strict ownership/authorization, no analytics logging of addresses. Transactional outbox event has IDs/status only (never shipping data).

## Endpoints

| Method | Endpoint | Result |
|---|---|---|
| POST | `/v1/orders` | 200 owned immutable pending order; idempotent |
| GET | `/v1/orders` | Paginated own orders (1..50 page size) |
| GET | `/v1/orders/{id}` | 200 or 404; no cross-user disclosure |
| POST | `/v1/orders/{id}/cancel` | 200 idempotent cancel/release (no payment/refund) |

## Database/migration

Additive migration `20261027231000_phase04c1_orders`: new `orders`, `order_lines`, `order_status_events`, enum `OrderStatus`, adds reservation status `CONSUMED`. No existing records rewritten; no customer data reset. Existing reservations, status guards and release logic remain compatible. SQL constraints and uniqueness enforce order references, one order per reservation, safe price math and idem per customer.

**Migration caution:** BACK UP both local dev/test databases; verify actual `current_database()` before `db:deploy` and `test:api:db:deploy`. `db:status` before deploying normally reports migration pending; rerun after. Do not edit an applied migration; do not use `migrate reset`.

## Windows acceptance

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
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
npm run test:api:visual:orders
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

**Acceptance:** real PostgreSQL fixture asserts concurrent request replay, collision rejection, owned access, immutable price/name after catalog mutation, absence of physical stock debit/movement, preserved reserved allocation under competition, duplicate-safe cancel, expiry batch, no leak after fixture cleanup. Swagger must emit JWT security + nested address schema and actual HTTP status in headed Chromium.

## Operational reminders

- `npm run checkout:expire` is a **mutating** operation. Production schedule must invoke it with the intended database credentials, and use a host-supported durable cron/job infrastructure; it is not an in-memory timer.
- Orders are intentionally REST-only, independent of storefront code and future Flutter API consumers.
- Historical orders and reservations use RESTRICT deletion semantics. Any customer deletion/anonymization and legal retention policies require a separate design. QA-only fixture cleanup explicitly cancels and deletes fixture orders prior to deleting reservations/products.
- Test-runner is limited to local `kookaburra_api_test`. Development database stays separate.
- Existing non-blocking `pg` concurrent-query deprecation remains; this patch does not hide/suppress it.
- Full Node 24 Prisma typecheck, PostgreSQL, Chromium and regression tests **must run on Windows** before this phase is accepted.
