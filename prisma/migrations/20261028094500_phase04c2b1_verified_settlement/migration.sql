-- 04C-2B1: provider-verified TEST settlement, no automatic card confirmation or capture.
ALTER TYPE "OrderStatus" ADD VALUE 'PAID';
ALTER TYPE "InventoryReason" ADD VALUE 'SALE';
ALTER TYPE "PaymentAttemptStatus" ADD VALUE 'SETTLED';
ALTER TABLE "orders" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "payment_webhook_receipts" ADD COLUMN "processed_at" TIMESTAMP(3),
  ADD COLUMN "processing_at" TIMESTAMP(3),
  ADD COLUMN "retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_webhook_receipts" ADD CONSTRAINT "payment_receipts_attempts_nonnegative" CHECK ("attempts" >= 0);
CREATE INDEX "payment_receipts_status_retry_idx" ON "payment_webhook_receipts"("status", "retry_at");
CREATE TABLE "payment_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "payment_attempt_id" UUID NOT NULL,
  "provider_intent_id" VARCHAR(128) NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_transactions_positive_amount" CHECK ("amount_minor" > 0),
  CONSTRAINT "payment_transactions_currency_upper" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX "payment_transactions_order_id_key" ON "payment_transactions"("order_id");
CREATE UNIQUE INDEX "payment_transactions_payment_attempt_id_key" ON "payment_transactions"("payment_attempt_id");
CREATE UNIQUE INDEX "payment_transactions_provider_intent_id_key" ON "payment_transactions"("provider_intent_id");
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
