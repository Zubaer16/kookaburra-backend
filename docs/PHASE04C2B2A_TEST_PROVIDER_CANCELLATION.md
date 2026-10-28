# Phase 04C-2B2A — Stripe TEST Intent Cancellation & Retry Recovery

## Baseline and acceptance boundary

Source baseline: `kookaburra-backend-full-20261028-101958.zip`, with the Phase 04C-2B1 Swagger `paidAt`/`payable` decorator fix checked in `src/orders/orders.dto.ts`.

**This is an operator-only compensation worker, not a payable customer checkout.** Phase 04C-2A `prepare` still returns `canConfirm:false`, `payable:false`, no `client_secret`. No customer card confirmation, capture or refund API is enabled. This patch does not change order cancellation semantics or stock balances.

The worker compensates for a Stripe TEST PaymentIntent left in `READY` after its unpaid order became `CANCELLED` or `EXPIRED`. It never cancels an order with `PAID` status and never touches `inventory_balances`, `order.status`, `payment_transactions` or `inventory_movements`.

## Database fields and state machine

Additive migration `20261028123000_phase04c2b2a_provider_cancellation`:

- PaymentAttemptStatus adds `CANCELLING` and `CANCELLED`.
- `payment_attempts.cancellation_started_at`, `cancellation_retry_at`, `cancellation_attempts` plus due-work index and nonnegative check.
- No historical data or existing enum values removed.

`READY` + closed unpaid order -> atomic claim `CANCELLING` -> Stripe TEST cancel outside DB transaction -> verify provider intent ID, `livemode=false`, order metadata, amount and currency. `status=canceled` and `amount_received=0` -> `CANCELLED` with outbox event `payment.test_intent_cancelled`. Provider status `succeeded`, nonzero received amount, or mismatched identity -> `REQUIRES_REVIEW` with audit-safe outbox event. Temporary provider errors -> bounded retry/lease recovery (7 attempts); never assume cancellation after a lost response, retrieve provider status first. A `CANCELLING` row with a null started timestamp is eligible once its retry time arrives, and stale leases can be retried after 90 seconds. Concurrent workers claim using guarded updates.

Legacy/ambiguous `CREATING`, `REQUIRES_REVIEW`, provider IDs missing or old unknown Stripe states are intentionally **not automatically canceled**. They require explicit operator reconciliation. A late successful provider payment is not automatically refunded; it is flagged for manual action. A `payment_intent.succeeded` receipt cannot mark a canceled order `PAID` through the existing settlement worker.

## API and Swagger

No new HTTP endpoint. `PaymentPreparationResponseDto.preparationStatus` now documents `CANCELLING` and `CANCELLED` in addition to previous statuses. The existing secured GET payment status can show the new state. No card secret, confirmation, capture or refund path is exposed. Swagger contract and negative security tests included.

## Local acceptance

Back up both local databases and independently confirm `current_database()` is `kookaburra-api-dev` or guarded `kookaburra_api_test` before migration.

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
npm run test:api:visual:payments
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

**Operator worker (MUTATES provider state):**

```powershell
npm run payments:cancel-intents
```

Do not run this worker against development, production or external Stripe accounts by default. First verify exact PostgreSQL target, `STRIPE_TEST_ENABLED`, TEST credentials, intended cancellation records, and deliberate operator approval. Guarded Playwright DB tests use a fake Stripe gateway and **never** call real Stripe. Actual TEST-provider cancel API and direct CLI execution are separate external acceptance gates.

## Required test evidence

- `api-tests/payment-cancellation.db.spec.ts`: real PostgreSQL, mocked provider, response-lost recovery, retry after delay, duplicate-safe cancellation, mismatched/succeeded provider quarantine, no inventory mutations.
- `api-tests/payment-cancellation.contract.smoke.spec.ts`: new status schema and no customer cancellation/capture/refund API.
- `api-tests/payment-cancellation.security.spec.ts`: no public mutation endpoints.
- Re-run existing Stripe settlement, order expiry, JWT, inventory/concurrency, Swagger Chromium tests.

## Known follow-ups

- Enable card confirmation/capture only after explicit authorization fencing, provider idempotency and expiry coordination are verified; then design refunds and refund-ledger invariants separately.
- Test provider-hosted API operations with Stripe TEST keys in an approved sandbox environment.
- Existing pg client concurrent-query deprecation is unrelated and remains unresolved.
- Phase 04C-2B1 report lists 167 total but the named test suites sum to 200 (or 202 including alignment); treat this as a report arithmetic discrepancy, not a product defect.
