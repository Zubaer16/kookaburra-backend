-- Phase 04C-2B2A: retryable Stripe TEST intent cancellation for already-closed orders.
-- Intent cancellation does not alter order or physical/reserved inventory.
ALTER TYPE "PaymentAttemptStatus" ADD VALUE 'CANCELLING';
ALTER TYPE "PaymentAttemptStatus" ADD VALUE 'CANCELLED';
ALTER TABLE "payment_attempts"
  ADD COLUMN "cancellation_started_at" TIMESTAMP(3),
  ADD COLUMN "cancellation_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "cancellation_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_cancellation_attempts_nonnegative" CHECK ("cancellation_attempts" >= 0);
CREATE INDEX "payment_attempts_status_cancellation_retry_at_idx"
  ON "payment_attempts"("status", "cancellation_retry_at");
