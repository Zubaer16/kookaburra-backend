# Phase 04C-2B1 — Stripe TEST verified settlement & inventory finalization foundation

Status: implementation complete; Windows PostgreSQL, Chromium and full test-mode Stripe acceptance **PENDING**.

## Boundary

This phase does **not** expose a card-confirmation method, `client_secret`, payment capture endpoint, or refunds. It does **not** activate customer payment collection. Previous 04C-2A PaymentIntents were configured `confirmation_method=manual` + `capture_method=manual`, so new merchant-side confirmation/capture/expiry reconciliation must be built and tested in a later increment. Do not treat this phase as ready for real orders or paid checkout. Stripe remains **test-mode only**, disabled by default. Use only local test database with mocked Stripe gateway for test execution.

## Stored semantics

- Adds `PAID` to `OrderStatus`, `SALE` to `InventoryReason`, `SETTLED` to `PaymentAttemptStatus`, nullable `paidAt` on orders, and append-only one-per-order `payment_transactions`. Existing order response includes `paidAt` and remains `payable:false` (it is not a payment instruction).
- `POST /v1/payments/stripe/webhook` remains a signed, raw-body-verifying, deduplicated **receipt**. The webhook does not directly finalize payment or inventory.
- Explicit `npm run payments:reconcile` operator command claims only signed `payment_intent.succeeded` receipts. It fetches the PaymentIntent again **directly from Stripe TEST API** and checks intent ID, `livemode=false`, `status=succeeded`, expected amount and `amount_received`, currency, and `metadata.order_id`.
- The worker then locks the order row and in ONE DB transaction writes a unique payment transaction, a `PAID` status event, SALE inventory movements, subtracts physical `on_hand` **and** `reserved_quantity`, synchronizes the product/variant stock mirrors, marks the attempt SETTLED and receipt PROCESSED, and emits an outbox event. `PAID` orders return 409 if an unpaid-only cancellation is attempted.
- A duplicate signed success receipt for an already-settled intent is marked PROCESSED, **without a second inventory movement**.
- A late success for CANCELLED/EXPIRED or overdue unpaid orders, or any amount/currency/order mismatch, is quarantined `REQUIRES_REVIEW` and **never** reallocates stock or changes the order to PAID. Refund/reversal requires a separate carefully designed operator workflow; no automatic refund is assumed.
- A signed success receipt awaiting verification prevents cancel/expiry stock release while `RECEIVED` or `PROCESSING`. `checkout:expire` skips those orders; run reconciliation first. A delayed/missing webhook can still arrive after expiry; its order is quarantined rather than automatically fulfilled. This is an explicit limitation until the provider-side cancellation fencing/expiry reconciliation phase.
- Transient provider/DB errors retry (15s–30m exponential backoff; maximum 7 attempts); abandoned PROCESSING claims recover after a 90s lease. After repeated failures, flag the receipt for review. Only receipt metadata and verified transaction amounts are stored, never payment card data or webhook payload.

## Important operational limitations

1. **Do not enable customer payments.** No client secret or confirmation/capture API is exposed; the current system is not a usable checkout payment path.
2. This worker must run from a trusted job scheduler/terminal with valid Stripe test keys and the intended database. It reads Stripe provider status and writes durable payment/order/inventory records. No scheduler is installed automatically. Never run against production/customer databases.
3. Before order-expiry jobs, reconcile already-received signed succeeded events. For active provider intents without a webhook, cancellation/expiry cannot know if a late success exists; external provider cancellation/status reconciliation and refund handling are follow-up blockers before actual payment activation.
4. This worker handles already-received `payment_intent.succeeded` webhook receipts only. It does not scan abandoned attempts or handle provider events with other event types.
5. Recovery requires operations review for `REQUIRES_REVIEW`. No automatic refund, settlement of unknown foreign intent, capture or provider-side cancellation is performed here.

## Acceptance commands on Windows

After backup and verified `DATABASE_URL` / `API_TEST_DATABASE_URL` targets:

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

Focused real-DB settlement test runs under `test:api:db`. NEVER run `payments:reconcile` against actual customer/development data without a deliberate operator decision; test the worker with mock gateway in the isolated test database. Actual Stripe TEST API retrieval and provider-hosted workflow remain pending external acceptance.
