# 04C-2A — Stripe TEST-only payment preparation & signed event receipts

This **does not turn on checkout payment**. This phase deliberately prepares test-only PaymentIntents using Stripe's REST API and persists verified webhook deliveries, without confirming/capturing cards or finalizing orders. `canConfirm:false`, `payable:false` and **no `client_secret`** are returned. Unpaid orders still expire normally after their original 20-minute deadline. No production traffic should attempt payment yet.

## Configuration

- `STRIPE_TEST_ENABLED=false` by default. The entire feature is inert unless explicitly enabled.
- `STRIPE_TEST_SECRET_KEY=sk_test_...` from a test-mode merchant account; live keys are **rejected** at startup.
- `STRIPE_TEST_WEBHOOK_SECRET=whsec_...` from the test webhook endpoint. The signing secret is **not** the Stripe API secret.
- Webhook endpoint: `POST /v1/payments/stripe/webhook`. Expose it only through HTTPS when testing remotely.
- The API runs with Nest Express `{rawBody:true}`; HMAC SHA-256 signatures are verified against the exact raw bytes, using Stripe's `t` and `v1` header format, ±300s freshness and constant-time equality.
- Stripe API key and signing secret never go to storefront/admin bundles. Do not paste real test keys into screenshots, issue trackers or uploads.

## API scope

- `POST /v1/payments/orders/:orderId/prepare` — CUSTOMER JWT; creates/replays one test intent per owned, valid unpaid order. Immutable amount/currency copied from the DB. Fixed provider URL. Stable Stripe idempotency key per order. **No payment confirmation**.
- `GET /v1/payments/orders/:orderId` — CUSTOMER JWT/ownership; returns preparation metadata or `null`. Never returns provider secrets.
- `POST /v1/payments/stripe/webhook` — public endpoint but **signature required**. Stores unique event ID, event type, PaymentIntent ID (if present) and SHA-256 body hash. Same ID and body are idempotent. No full payload/PII stored. Event status is `RECEIVED`, **not processed**.

## Invariants / deliberate missing functionality

- Stripe parameters `confirmation_method=manual`, `capture_method=manual`, `payment_method_types[]=card` protect the next phase's explicit settlement boundary. An intent can be created but there is no customer-facing confirmation credential or API in this phase.
- **Never infer payment success from a redirect or receipt.** Webhook receipt is not order settlement; it must be reconciled against the provider when 04C-2B is implemented.
- `PaymentAttempt` has one-to-one order uniqueness, immutable amount/currency, recoverable `CREATING` lease and the same Stripe idempotency key for retries. Automatic recovery fails closed after 22 hours; operator must inspect the provider before manual changes.
- If the order closes while a provider call is in-flight, the returned intent is marked `REQUIRES_REVIEW` (and an HTTP 409 is returned). This requires later provider reconciliation. It is **not** treated as a paid order.
- Order cancellation and expiry deliberately retain Phase 04C-1 semantics. Physical on-hand and reserved stock are unchanged by preparation and signed event ingestion.
- There is NO client secret, no confirmation, no automatic capture, no refund, no paid status, no inventory finalization, no Stripe reconciliation worker, and no PCI card input endpoint here. Do not activate frontend payments or send manual capture commands until 04C-2B is implemented and accepted.
- During 04C-2B, implement intent cancellation after order cancellation/expiry, status reconciliation of provider events, payment-authorized safety fencing, out-of-order webhook handling, capture/stock finalization, refunds, and recoverable failure paths **before** making orders payable. In particular provider-side payments should not be authorized for an order whose stock has already been released.

## Database / testing

- Additive migration `20261027234500_phase04c2a_stripe_intent_receipts`, adds `payment_attempts`, `payment_webhook_receipts` and `PaymentAttemptStatus`. Does not touch previous order/inventory rows.
- `npm run test:api:smoke`: OpenAPI/ownership contract and no `clientSecret` DTO.
- `npm run test:api:db`: isolated localhost test database + FAKE gateway double (never Stripe live/test network), verifies one intent/replay, signed receipt dedupe and no order/stock changes.
- `npm run test:api:security`: disabled provider isolation, JWT/RBAC and no credentials in API test runner.
- `npm run test:api:visual:payments`: Swagger Chromium with disabled gateway. This is a UI regression test, not an actual Stripe charge.
- To verify a real Stripe test API call, configure the developer's local `.env` (NOT `.env.api-test`) with actual test keys, create an unpaid order with >0 amount, call `POST /v1/payments/orders/:orderId/prepare`, then confirm **intent preparation only** and no client secret. Stripe test webhook delivery can be inspected in provider tools, with care not to include sensitive payloads in logs. Do not confirm or capture.

## Pending acceptance

This archive was statically checked where built. Running Node 24 + Prisma 7.9.1 generation/typecheck, local PostgreSQL concurrency tests, and headed Chromium is still mandatory on Windows. No claim of actual provider requests or receipt callbacks executed here.
