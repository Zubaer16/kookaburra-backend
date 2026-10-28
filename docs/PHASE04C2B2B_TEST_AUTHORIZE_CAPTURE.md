# Phase 04C-2B2B — Stripe TEST-only card simulation and captured-payment fencing

## Boundary / prerequisite

Baseline: `kookaburra-backend-full-20261028-112940.zip`, after 04C-2B2A passed its supplied Windows validation suite. The code review found no new blocking issue with the cancellation migration or its retry/review contract. The validation report says “167” test executions but the explicitly listed counts sum to 206 including the repeated focused Chromium test and alignment tests. Do not treat arithmetic in a report as evidence of an application failure.

This increment deliberately implements only a **fixed TEST card** confirmation-and-capture path. It is **not a production checkout**, customer card form, refund service, or public card-processing API. Production is explicitly forbidden from enabling this feature. Refund ledger, partial refunds, payment reversal and stock return are separate follow-up work.

Stripe docs: a manual-capture PaymentIntent moves to `requires_capture` after successful confirmation. Capturing can then move it to `succeeded`. The existing verified webhook receipt + `PaymentSettlementService` (04C-2B1) is still the only path that marks an order `PAID` and deducts stock. A successful API capture response **never** settles a Kookaburra order by itself.

## Configuration

`STRIPE_TEST_CHECKOUT_ENABLED=false` is new and **false by default**. To allow an explicit sandbox-only demonstration both `STRIPE_TEST_ENABLED=true` and `STRIPE_TEST_CHECKOUT_ENABLED=true` must be configured with valid TEST keys and signing secret. Validation rejects `STRIPE_TEST_CHECKOUT_ENABLED=true` in `NODE_ENV=production`, even if the Stripe keys are test keys. API/Chromium runner always forces both flags off. Do not copy real keys into the repository or a report.

## API

`POST /v1/payments/orders/{orderId}/test-complete` — CUSTOMER JWT and order ownership required. No request body, no arbitrary payment-method identifier and no card details. Internally uses Stripe's fixed **`pm_card_visa` TEST fixture**. The payment intent must previously be prepared via `POST /v1/payments/orders/{orderId}/prepare` and belong to the same open, unexpired order. No raw card numbers, no browser `client_secret`, no real/live Stripe use.

Response fields: `orderId`, `testMode: true`, `state`, `paid`, `settlementPending`. `AWAITING_WEBHOOK` means captured in Stripe TEST but **not** yet settled in the store. Only a separately verified signed Stripe test success event and the existing reconciliation worker can finalize a paid order. `SETTLED` reflects an already settled order; it does not trigger a new settlement.

## Safety details

- Additive enum values `CONFIRMING`, `CAPTURING`, `AWAITING_WEBHOOK` and a lease/attempt counter on `payment_attempts`.
- Claim under the order row lock (same order-first lock ordering as cancellation/expiry).
- Re-fetch provider state before _any_ retry so a lost confirm/capture response cannot cause a second capture blindly.
- Fixed per-order provider idempotency keys for confirm and capture.
- Order cancel and expiry release are fenced during `CONFIRMING`, `CAPTURING`, `AWAITING_WEBHOOK` and for TEST-confirmation-origin `REQUIRES_REVIEW`; no automatic inventory release while a captured amount may be in flight.
- A provider error is fail-closed, and an in-flight attempt requires a 90-second lease before a subsequent retry. Maximum seven attempts; after a persistent problem, manual reconciliation is necessary.
- `REQUIRES_REVIEW` is an operator action state. **Do not assume it is safe to refund, release, recapture or mark PAID solely from that status.**
- There is no auto-release worker for abandoned TEST captures yet; **monitor and reconcile held stock**. This is a blocker for production enablement, not for disabled-by-default sandbox tests.

## Test plan

Back up both local databases, verify `current_database()` and migrations, then:

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

Focused tests: `payment-test-completion.contract.smoke.spec.ts`, `payment-test-completion.security.spec.ts`, `payment-test-completion.db.spec.ts` (isolated real PostgreSQL + mocked Stripe test gateway). Chromium verifies the new endpoint is disabled without keys and produces an actual 503 HTTP response. No real Stripe API call is required for automated acceptance.

Manual external acceptance is separate: only in an approved Stripe **test** account, on a non-production instance with a controlled order and webhooks; inspect returned states, signature handling, and provider-side idempotency. Keep both flags false otherwise.

## Remaining work before real checkout

Customer-facing Stripe Elements integration/3DS flow, fully durable stale capture reconciliation, operator manual-review UI, refund/payment-reversal ledger and refund limits, shipments/returns and explicit stock-restock policies, tax region compliance, and live-environment security review.
