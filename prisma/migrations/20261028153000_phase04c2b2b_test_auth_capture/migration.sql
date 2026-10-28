-- Phase 04C-2B2B: explicit TEST-only confirmation and capture state fencing.
-- Does NOT create settlements, refunds, or change existing inventory data.
ALTER TYPE "PaymentAttemptStatus" ADD VALUE 'CONFIRMING';
ALTER TYPE "PaymentAttemptStatus" ADD VALUE 'CAPTURING';
ALTER TYPE "PaymentAttemptStatus" ADD VALUE 'AWAITING_WEBHOOK';
ALTER TABLE "payment_attempts"
  ADD COLUMN "test_completion_started_at" TIMESTAMP(3),
  ADD COLUMN "test_completion_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_test_completion_attempts_nonnegative" CHECK ("test_completion_attempts" >= 0);
