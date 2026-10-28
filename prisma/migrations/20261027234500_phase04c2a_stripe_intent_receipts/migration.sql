-- Additive: Stripe TEST intent preparation & signed webhook receipts.
-- No order PAID status, card capture, inventory deduction or financial posting.
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATING', 'READY', 'REQUIRES_REVIEW');
CREATE TABLE "payment_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "provider" VARCHAR(30) NOT NULL DEFAULT 'STRIPE_TEST',
  "provider_intent_id" VARCHAR(128),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATING',
  "amount_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "creation_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_attempts_amount_positive" CHECK ("amount_minor" > 0),
  CONSTRAINT "payment_attempts_currency_upper" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX "payment_attempts_order_id_key" ON "payment_attempts"("order_id");
CREATE UNIQUE INDEX "payment_attempts_provider_intent_id_key" ON "payment_attempts"("provider_intent_id");
CREATE UNIQUE INDEX "payment_attempts_idempotency_key_key" ON "payment_attempts"("idempotency_key");
CREATE INDEX "payment_attempts_status_creation_started_at_idx" ON "payment_attempts"("status", "creation_started_at");
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey"
 FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider_event_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "provider_intent_id" VARCHAR(128),
  "payload_sha256" VARCHAR(64) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_receipts_provider_event_id_key" ON "payment_webhook_receipts"("provider_event_id");
CREATE INDEX "payment_webhook_receipts_provider_intent_id_idx" ON "payment_webhook_receipts"("provider_intent_id");
CREATE INDEX "payment_webhook_receipts_status_received_at_idx" ON "payment_webhook_receipts"("status", "received_at");
