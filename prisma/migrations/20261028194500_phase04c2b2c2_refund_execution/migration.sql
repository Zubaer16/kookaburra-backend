-- Additive only. Refund request/amount allocations remain unchanged.
ALTER TABLE "refund_requests"
  ADD COLUMN "provider_status" VARCHAR(30),
  ADD COLUMN "processing_started_at" TIMESTAMP(3),
  ADD COLUMN "first_submitted_at" TIMESTAMP(3),
  ADD COLUMN "retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_attempts_nonnegative" CHECK ("attempts" >= 0);
CREATE INDEX "refund_requests_status_retry_at_idx"
  ON "refund_requests"("status", "retry_at");
