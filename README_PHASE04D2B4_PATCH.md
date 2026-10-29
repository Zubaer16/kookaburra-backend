# Kookaburra V2 — G1 / Phase 04D-2B-4: Customer pending-return withdrawal

**Source baseline:** `kookaburra-backend-full-20261029-130114.zip` (336 entries, G1-3 present). **Status:** SOURCE IMPLEMENTED / LOCAL POSTGRESQL + CHROMIUM ACCEPTANCE PENDING. This is a root-level incremental `.tar.gz` overlay, not a full repository.

## Behavior

- Add `POST /v1/orders/:id/returns/:returnId/cancel` for authenticated CUSTOMER + owned order UUID. JSON body `{ "requestId": "<uuid>" }` only. Result 200 `OrderReturnResponseDto` with `CANCELLED` status. No Admin impersonation.
- An action can withdraw ONLY `REQUESTED` returns. Once Admin approves/rejects/inspects or a return is restocked, withdrawal is forbidden (409). Other customer/order/return returns 404; invalid UUID/body returns 400. No public route.
- The existing order-row `FOR UPDATE` transaction serializes cancellation and Admin approval. A retried identical action UUID returns the same cancelled record; reuse of the UUID with a different action conflicts. Transactional audit + `order.return.cancel` outbox event; **no stock/inventory movement, refund, payment state, original shipment mutation, or replacement**.
- Preserve cancelled history. `REJECTED` and `CANCELLED` quantities do not consume future available customer return-request quantity for the same purchased line. A new request needs a **new UUID**.
- Additive Prisma enum migration `20261029132000_phase04d2b4_customer_pending_return_withdrawal` and DTO/Swagger tracking enum update. Never reset the DB or rewrite old migrations.

## Pre-apply

From the backend repo root: verify intended **LOCAL** `kookaburra-api-dev` and separate `kookaburra_api_test` URLs, take fresh verified backups of BOTH DBs and review working tree before extracting. Only the owner runs PostgreSQL migration acceptance; do not point at production.

```powershell
tar -tzf "$env:USERPROFILE\Downloads\KOOKABURRA_G1_PHASE04D2B4_OVERLAY.tar.gz"
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G1_PHASE04D2B4_OVERLAY.tar.gz" -C .
```

## Validation commands (run in order; STOP on failure)

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
npm run test:api:visual:replacements
npm run test:api:visual:tracking
npm run test:api:visual:admin-cancel
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

`alignment:audit` / `alignment:test` full cross-repo verification requires `KOOKABURRA_ADMIN_DIR` and `KOOKABURRA_STOREFRONT_DIR` configured. They do not prove live UI integration.

## Evidence / exclusions

Source syntax parse plus cross-repository alignment checks ran outside Windows. PostgreSQL/Prisma migrations, `npm run check`, tests and Chromium are **NOT** claimed PASS yet for G1-4. Retain command logs/DB migration status and provide new post-apply full Backend ZIP. Owner reports G1-3 tests PASS; latest source confirms implementation, but raw Windows logs were not supplied.

**G1 remains OPEN:** cross-SKU/price-changing exchange business contract, mixed per-line refunds and replacements, paid-order cancellation/refund, partial shipments and public order-number tracking are not implemented by this patch and must not be assumed.
