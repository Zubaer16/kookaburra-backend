-- 05A-2: Additive, private customer address book. Profile display_name already exists.
-- Existing orders retain immutable shipping snapshots; no historic data is migrated.
CREATE TABLE "customer_addresses" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "label" VARCHAR(40) NOT NULL DEFAULT 'Home',
  "recipient_name" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(16) NOT NULL,
  "address_line_1" VARCHAR(200) NOT NULL,
  "address_line_2" VARCHAR(200) NOT NULL DEFAULT '',
  "city" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100) NOT NULL DEFAULT '',
  "postal_code" VARCHAR(20) NOT NULL DEFAULT '',
  "country_code" VARCHAR(2) NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_addresses_user_id_created_at_idx"
  ON "customer_addresses"("user_id", "created_at");
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Database invariant backs up the per-user transaction lock: at most ONE default.
CREATE UNIQUE INDEX "customer_addresses_one_default_per_user"
  ON "customer_addresses"("user_id") WHERE "is_default" = true;
