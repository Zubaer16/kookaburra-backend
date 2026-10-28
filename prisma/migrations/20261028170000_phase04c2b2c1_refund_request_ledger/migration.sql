-- 04C-2B2C1: ledger-only; no Stripe API calls, balance deduction or restock.
CREATE TYPE "RefundRequestStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REQUIRES_REVIEW');

CREATE TABLE "refund_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_transaction_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" UUID NOT NULL,
    "provider_refund_id" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "refund_requests_amount_positive" CHECK ("amount_minor" > 0),
    CONSTRAINT "refund_requests_reason_allowed" CHECK ("reason" IN ('CUSTOMER_REQUEST','DUPLICATE','FRAUDULENT','OTHER'))
);
CREATE UNIQUE INDEX "refund_requests_order_request_key" ON "refund_requests"("order_id", "request_id");
CREATE UNIQUE INDEX "refund_requests_provider_refund_id_key" ON "refund_requests"("provider_refund_id");
CREATE INDEX "refund_requests_order_id_status_idx" ON "refund_requests"("order_id", "status");
CREATE INDEX "refund_requests_payment_transaction_id_idx" ON "refund_requests"("payment_transaction_id");
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_transaction_id_fkey"
  FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
