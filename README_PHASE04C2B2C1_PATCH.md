# Phase 04C-2B2C1 — Refund Request Ledger (NO Stripe refund)

Overlay this `.tar.gz` at the repository root on `kookaburra-backend-full-20261028-123544.zip`.

- OWNER may POST /v1/admin/payments/orders/:orderId/refunds with requestId UUID, amountMinor, reason.
- OWNER may GET /v1/admin/payments/orders/:orderId/refunds.
- CUSTOMER may GET /v1/payments/orders/:orderId/refunds for their own order.
- Only verified PAID orders with a payment transaction can accept requests.
- Total open + succeeded refund requests never exceeds captured amount; one request UUID is idempotent.
- Each request writes an audit event and transactional outbox event.
- DOES NOT issue Stripe refund, restock inventory, change paid status, or change recorded revenue.
- `REQUESTED` is not proof of money being refunded; no provider integration until later phase.

Apply from Windows PowerShell after backing up and checking local DB targets:

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04c2b2c1-refund-ledger-20261028.tar.gz" -C .
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
npm run test:api:visual:payments
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

First `db:status` may report one pending migration. No reset is required.
Tests must use existing guarded isolated local PostgreSQL. No external Stripe calls required.
