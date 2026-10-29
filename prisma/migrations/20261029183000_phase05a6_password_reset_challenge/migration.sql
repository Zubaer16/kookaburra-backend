-- Additive per-user password reset challenge. No historical records modified.
CREATE TABLE "password_reset_challenges" (
  "user_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "window_start_at" TIMESTAMP(3) NOT NULL,
  "window_count" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX "password_reset_challenges_token_hash_key" ON "password_reset_challenges"("token_hash");
CREATE INDEX "password_reset_challenges_expires_at_idx" ON "password_reset_challenges"("expires_at");
ALTER TABLE "password_reset_challenges"
  ADD CONSTRAINT "password_reset_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
