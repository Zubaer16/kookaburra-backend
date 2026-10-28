# Phase 04D-1 — Paid Order Fulfillment Foundation

## Boundary

Single-shipment, all-lines fulfillment only; no partial shipments, tracking-carrier polling, returns/restock, dispatch emails, or real customer payment checkout. `Order.status` remains `PAID`. Shipment progress is a separate enum and never changes payment/refund/inventory balances.

## Access and lifecycle

Admin `orders.manage` permission is required for `GET /v1/admin/orders`, `GET /v1/admin/orders/:id`, `POST /v1/admin/orders/:id/fulfillment/start|ship|deliver` (JWT, Admin role, server-side permission check). Customer `GET /v1/orders/:id` and list expose only _their own_ fulfillment tracking.

Allowed transitions: `null -> PROCESSING -> SHIPPED -> DELIVERED`. Only `PAID` orders with persisted payment transactions and `paidAt` may start. Any refund request blocks further transitions until a separate return/review workflow exists. Carrier and tracking number are set only during SHIPPED. Delivery timestamp is added only during DELIVERED.

Every transition has a client UUID `requestId`, committed atomically with the status update, shipment event, actor audit and outbox notification event. Same UUID + same transition/input is safely replayed, different input returns 409. `orders` row locks serialize competing transitions with payment updates. The API never trusts client-supplied payment status or inventory totals.

## New database tables

`order_shipments` (one row/order), `order_shipment_events` (append-only, unique order/request UUID). Migration is additive. FK RESTRICT protects order history; local test fixture teardown removes its own shipment rows before deleting orders.

## Acceptance

Back up LOCAL `kookaburra-api-dev` and `kookaburra_api_test`, verify DB identity, then run:

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
npm run test:api:visual:fulfillment
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

No secrets in logs. Real Node 24/PostgreSQL/Chromium acceptance must be done in Windows environment. Release is limited to backend shipment progress; customer/admin UI not yet integrated.
