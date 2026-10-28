# Phase 04C-2B2C2 — Stripe TEST Refund Execution & Provider-Verified Reconciliation

**Baseline:** `kookaburra-backend-full-20261028-133557.zip` (Phase 04C-2B2C1 validated by user's local tests).

## Scope

- Existing OWNER-only `POST /v1/admin/payments/orders/:orderId/refunds` creates an _approved allocation_; the HTTP request **never calls Stripe**.
- New `RefundExecutionService` and explicit `npm run payments:refunds` operator worker (10 records/batch); no new public refund mutation API.
- `STRIPE_TEST_REFUNDS_ENABLED=false` by default, and activation additionally requires Stripe TEST credentials, `STRIPE_TEST_ENABLED=true`, and `NODE_ENV != production`.
- Each refund record uses immutable ID/amount/currency and Stripe idempotency key `kb-test-refund-<refundUUID>`; no customer-supplied provider amounts.
- `POST /v1/refunds` uses the verified paid transaction's PaymentIntent with `amount`, normalized `reason` and minimal `order_id` / `refund_request_id` metadata; `GET /v1/refunds/{id}` is freshly checked before `SUCCEEDED` or `FAILED` is recorded.
- Refund provider response is validated for ID, PaymentIntent, amount, currency, two metadata IDs and non-live mode (TEST key enforced). Stripe's Refund API object need not include a `livemode` field; a present `livemode:true` is rejected.
- A `PROCESSING` lease (90s) plus retry/backoff and a 22h **unknown-refund-ID** replay fence prevents unbounded re-submission after a lost provider response. Unknown/ambiguous state eventually becomes `REQUIRES_REVIEW`, never falsely `SUCCEEDED`.
- Verified `pending` remains processing, verified `succeeded` becomes `SUCCEEDED`, verified `failed/canceled` becomes `FAILED`; unexpected/mismatched objects become `REQUIRES_REVIEW`. All transitions are idempotent, with audit-friendly outbox entries.
- The existing ledger prevents an aggregate of REQUESTED/PROCESSING/SUCCEEDED/REQUIRES_REVIEW amounts exceeding the paid total. FAILED requests release their allocation. Customer/Admin read API now reflects `providerRefundSubmitted` when a Stripe refund ID has been persisted.
- **No stock restock, Order status change, actual return/RMA, customer-facing refund action, or live payment capability.** No scheduled job is automatically installed. Provider-side status may require asynchronous manual follow-up.
- No credentials go in tracked files; never upload `.env` or database backups. This worker sends real **TEST** refund requests to Stripe when deliberately enabled and run; it is not a harmless read-only command.

## Operating guardrails

1. Review migration and create local development/test DB backups. Verify `current_database()` and actual configured DB before `db:deploy`.
2. Apply patch from repository root; run `db:generate`, `db:validate`, `db:status`, `db:deploy`, `db:status`, `test:api:db:deploy`.
3. Run `npm run check`, `npm run test:api:smoke`, `npm run test:api:db`, `npm run test:api:security`, `npm run test:api:visual:payments`, `npm run test:api:visual:all`, `npm run alignment:audit`, `npm run alignment:test`.
4. Mocked Stripe gateway tests are part of the real-PostgreSQL suite; they cannot establish live Stripe API compatibility. Test with isolated TEST-provider records separately before allowing the worker to execute against developer data.
5. Deliberately enable `STRIPE_TEST_REFUNDS_ENABLED=true` only in non-production with `sk_test_...` and `STRIPE_TEST_ENABLED=true`, after reviewing the pending refund requests. Never allow real keys.
6. Run `npm run payments:refunds` manually once against the _verified_ intended database. Inspect success/failure/review history and no restock. Then configure a safe scheduled dispatcher when release-ready.
7. Obtain explicit operator approval for ambiguous payments; never auto-resubmit unknown refunds after the 22h replay fence. `REQUIRES_REVIEW` is intentionally non-retriable without a new, audited workflow.

## Acceptance gates

- No duplicate provider refund for concurrent worker attempts/replay; idempotency key is stable.
- Failed/canceled provider refunds free their ledger allocation, but no partial PAID order/SALE stock change occurs.
- Stripe provider mismatch, unexpected status or retry exhaustion goes to review; zero provider calls while disabled.
- Existing JWT, RBAC, 04C-2B2C1 amount ceilings, 04C-2B1 stock settlement and Swagger contract tests remain green.
- Existing source alignment `ADAPTER` findings remain a separate Storefront/Admin integration task.

## Deferred

- Provider-generated webhook receipts for `refund.updated` / `refund.failed`, scheduling, persistent delivery metrics, customer messages and fulfillment/returns policy; this iteration uses authenticated Stripe TEST status reads in the worker instead of trusting webhook event names.
- Any refund-induced inventory return requires an independent receipt/return workflow; never increment stock simply because money was refunded.
- The test-only payment flow is **not production-ready**. Full client-facing checkout, email, FCM and Flutter are separate milestones.
