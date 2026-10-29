# Phase 04D-2A — Returns, Physical Inspection and Safe Restocking

Baseline: `kookaburra-backend-full-20261028-162214.zip` (04D-1 accepted per user report).

## Scope

- Customer can request return of an **individual order line** only after **PAID + DELIVERED**.
- `OrderLineResponseDto.id` is an additive, immutable identifier available to Storefront, Admin, and future Flutter for return selection.
- Requests include one `requestId` UUID, `orderLineId`, positive integer `quantity`, and reason (`DAMAGED`, `WRONG_ITEM`, `NOT_AS_DESCRIBED`, `OTHER`).
- The **sum of all non-rejected return quantities for one order line** cannot exceed sold quantity, including in concurrent requests.
- OWNER or staff with `orders.manage` can approve/reject, record physically received condition, and explicitly restock verified **RESTOCKABLE** units. No other roles can restock.
- A rejected request frees its requested-quantity allowance; an approved/received/restocked return never frees that allowance for further returns.
- Inspected **DAMAGED** returns never increase available stock automatically.
- Restock checks the original SKU/variant identity still exists, uses an atomic guarded balance update (INT32 ceiling), updates product/variant stock mirror, and creates exactly one `RETURN` inventory movement in the **same DB transaction**.
- Every admin action requires a unique UUID; identical retries are safe, changed-payload retries receive 409. Order row locking serializes requests and prevents concurrent double restock.
- Outbox and audit events record changes without personal customer details or client-supplied monetary values.
- Financial refund requests, provider refunds, payments, and order `PAID` status remain entirely separate. No refund is created or triggered by these endpoints.

## State machine

```text
REQUESTED -> APPROVED -> RECEIVED_RESTOCKABLE -> RESTOCKED
          -> REJECTED
APPROVED -> RECEIVED_DAMAGED  (terminal, no restock)
```

Only APPROVED returns may be physically received. A RESTOCKABLE return **does not** change stock until explicit `restock`. No transition can silently skip inspection.

## New APIs (JWT required)

Customer (only owned orders):

- `POST /v1/orders/:id/returns`
- `GET /v1/orders/:id/returns`

Admin (OWNER or `orders.manage`):

- `GET /v1/admin/orders/:id/returns`
- `POST /v1/admin/orders/:id/returns/:returnId/approve`
- `POST /v1/admin/orders/:id/returns/:returnId/reject`
- `POST /v1/admin/orders/:id/returns/:returnId/receive` with `condition: RESTOCKABLE | DAMAGED`
- `POST /v1/admin/orders/:id/returns/:returnId/restock`

All mutation requests include `requestId: UUID`. Customer POST also has `orderLineId: UUID`, `quantity`, `reason`. Admin endpoints have no client-specified stock delta, price or refund amount.

## Migration and test acceptance

New additive migration: `20261028223500_phase04d2a_returns_inspection_restock` creates enum, two return tables, indexes, constraints. No data reset, historical migration edit, or seed.

Back up `kookaburra-api-dev` and `kookaburra_api_test`, verify connection targets, then:

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
npm run test:api:visual:returns
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

The first status may report the pending migration. Tests require **real local PostgreSQL and headed Chromium**. Static syntax verification does not constitute acceptance.

### Critical acceptance cases

- Owner permission and cross-customer isolation; invalid payloads rejected.
- Repeat request UUID returns original return without booking extra units; different payload with same UUID is 409.
- Two concurrent requests exceeding remaining order-line quantity cannot both succeed.
- Unpaid/undelivered orders cannot be returned.
- Approve/reject/receive/restock stages enforce exact expected states, no skipped inspection.
- Damaged receipt cannot restock.
- Restock exactly once under repeated/concurrent calls; one `RETURN` movement per return; no change to payment/refund ledger.
- Original SKU missing/changed requires manual review rather than restocking into the wrong product.
- Product/variant stock mirrors and reserved stock invariants remain correct.
- Entire regression suite passes without disabled or weakened tests.

## Deferred

Product returns shipping labels/automated couriers, return windows, exchange/replacement orders, per-line refund calculations, VAT/tax credit notes, restocking fees, partial shipment, batch/serial/lot tracking and production notification delivery are outside this increment.
