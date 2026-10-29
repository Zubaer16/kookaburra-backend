-- G2 / 05A-5: additive identity state + single active verification challenge.
-- Existing accounts remain unverified; LOGIN/CHECKOUT NOT GATED in this patch.
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);
CREATE TABLE "email_verification_challenges" (
  "user_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX "email_verification_challenges_token_hash_key"
  ON "email_verification_challenges"("token_hash");
CREATE INDEX "email_verification_challenges_expires_at_idx"
  ON "email_verification_challenges"("expires_at");
ALTER TABLE "email_verification_challenges"
  ADD CONSTRAINT "email_verification_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
