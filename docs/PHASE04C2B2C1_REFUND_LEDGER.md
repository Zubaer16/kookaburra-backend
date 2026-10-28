# Phase 04C-2B2C1 — Refund Request Ledger and Amount Protection

**Scope: backend financial intent ledger only. NOT an executed refund.**

## Contract

- `POST /v1/admin/payments/orders/:orderId/refunds` OWNER-only, body `{requestId: UUID, amountMinor: integer, reason: CUSTOMER_REQUEST | DUPLICATE | FRAUDULENT | OTHER}`. Returns 200 for new or same-key replay; 409 for different-key replay, unpaid orders or amount ceiling.
- `GET /v1/admin/payments/orders/:orderId/refunds` OWNER-only.
- `GET /v1/payments/orders/:orderId/refunds` CUSTOMER owned order only.
- No provider refund or stock return. `providerRefundSubmitted:false`, `stockReturned:false` in response. Customer cannot submit financial operations.

## Accounting and concurrency

- Request is eligible only after order PAID and payment transaction amount/currency equals paid order.
- PostgreSQL order `FOR UPDATE` serializes writes for the order (also aligns with existing payment/order lock order).
- Pending/review/processing/succeeded refund request amounts all count against paid amount; failed requests do not.
- `UNIQUE(order_id, request_id)` prevents duplicate request IDs. Same request ID and same parameters replays original record, never allocates money again.
- Transaction writes request, audit and outbox atomically.
- Request status `REQUESTED` is not proof of successful Stripe refund. No endpoint sets `SUCCEEDED`.

## Future phases

- Provider-side Stripe TEST refunds, verified refund reconciliation, retry/review flow, and cancellation/refund order status accounting.
- Stock return and restocking is NOT automatically coupled to a financial refund; fulfillment/returns needs separate workflow.
- Refund requests have restrictive FK so accounting history remains stable and cannot be erased by order deletion.

## Local acceptance

1. Backup `kookaburra-api-dev` and `kookaburra_api_test`, and verify `current_database()` before deploy.
2. Apply additive migration `20261028170000_phase04c2b2c1_refund_request_ledger`.
3. Run `npm run check`, API smoke/db/security, focused and full Chromium suite, alignment audit/test.
4. Confirm concurrent partial requests cannot exceed paid amount, and no Stripe calls/inventory changes occur.
5. Storefront/Admin integration and actual provider refund execution remain pending.
