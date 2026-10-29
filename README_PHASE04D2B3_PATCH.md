# G1 / Phase 04D-2B-3 — Guarded Admin Unpaid-Order Cancellation

**Status:** SOURCE IMPLEMENTED / LOCAL ACCEPTANCE PENDING. Apply only over `kookaburra-backend-full-20261029-124725.zip` or a source snapshot containing G1-1 and G1-2. No Prisma model or migration changes.

## Scope

- `POST /v1/admin/orders/:id/cancel`: requires Admin JWT with `orders.manage` (OWNER or explicitly permitted staff). Returns existing order response. No body; repeated requests against closed order return its unchanged state.
- **Only PENDING_PAYMENT** orders can change. Releases its reserved allocation once under the same order-row lock and payment/webhook in-flight fence as the existing customer cancellation. Deadline-passed orders close as EXPIRED.
- PAID orders reject with `409`; no automatic refund, reversal of successful payment, inventory restock, fulfillment transition, or provider call. `CANCELLED`/`EXPIRED` retries are read-only.
- Successful Admin-triggered closing writes the appropriate order status event (`ADMIN_CANCELLED` or `PAYMENT_WINDOW_ELAPSED`), transactional outbox and actor audit record. Existing customer cancellation keeps `CUSTOMER_CANCELLED`.
- Adds contract, DB, security, unit and Chromium Try-it-out coverage. No changes to frontend apps. Admin UI remains a separate integration task.
- **Still OPEN (G1):** paid-order refund/cancellation policy, per-line refund versus replacement policy, cross-SKU exchanges (pricing/tax/stock) and partial shipments. No claims of G1 gate acceptance.

## Apply (PowerShell, from backend root)

Verify both DB identities and fresh dev/test backups **before** applying/migrations. Never reset either DB.

```powershell
tar -tzf "$env:USERPROFILE\Downloads\KOOKABURRA_G1_PHASE04D2B3_OVERLAY.tar.gz"
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G1_PHASE04D2B3_OVERLAY.tar.gz" -C .
```

## Validation commands

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

npm run test:api:visual:admin-cancel
npm run test:api:visual:tracking
npm run test:api:visual:replacements
npm run test:api:visual:returns
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

**Acceptance:** Record complete exact test outputs, any local fixes and new full ZIP; do not declare PASS or G1 closed from code presence alone. No new migrations are expected in this patch.
