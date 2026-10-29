# Phase 04D-2B-4 — Customer-requested pending return withdrawal

- Source snapshot: `kookaburra-backend-full-20261029-130114.zip`.
- New REST action: `POST /v1/orders/:id/returns/:returnId/cancel`, authenticated CUSTOMER + owned order. Required validated UUID `requestId`, no client-supplied status or quantity.
- State transition: `REQUESTED` → `CANCELLED` only. Rejected, already approved, inspected or restocked returns cannot be withdrawn; no undo of refund, inventory, payment, or replacement state.
- Serialization: same PostgreSQL order row `FOR UPDATE` lock as Admin return transitions and new return quantity allocation; exact idempotent action retries return the recorded terminal state. Different action with the same UUID yields 409.
- Ledger/history: `order_return_events` action `CANCEL`, audit event `order.return.cancel` and durable outbox event `order.return.cancel` contain safe identifiers/status. No physical shipment, restock or payment movement.
- `CANCELLED` and `REJECTED` rows remain visible to customer/Admin but do not consume future return-request allowance. Older requestIds still replay the original record, not create new returns.
- Migration: additive enum `OrderReturnStatus.CANCELLED`; no existing data rewrite, no DB reset. Update Storefront and Admin presentation during their integration phases; no web app changed here.
- Tests: Jest status policy, real PostgreSQL concurrent same-key cancel/quantity release/stock & refund invariants, security (401/403/404/400), OpenAPI and Swagger Chromium `Try it out -> Execute`; test results pending owner's local Windows run.
