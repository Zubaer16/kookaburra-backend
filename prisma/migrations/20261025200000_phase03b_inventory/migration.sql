-- Phase 03B: additive stock ledger, historical balances preserved. Review and
-- back up development DB before running `npm run db:deploy`.
CREATE TYPE "InventoryReason" AS ENUM ('OPENING', 'RECEIPT', 'RETURN', 'DAMAGE', 'CORRECTION');
CREATE TABLE "inventory_balances" (
  "id" UUID NOT NULL,
  "product_id" UUID,
  "variant_id" UUID,
  "on_hand" INTEGER NOT NULL DEFAULT 0,
  "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_balance_one_target" CHECK
    (("product_id" IS NOT NULL) <> ("variant_id" IS NOT NULL)),
  CONSTRAINT "inventory_balance_nonnegative" CHECK
    ("on_hand" >= 0 AND "low_stock_threshold" >= 0)
);
CREATE UNIQUE INDEX "inventory_balances_product_id_key" ON "inventory_balances"("product_id");
CREATE UNIQUE INDEX "inventory_balances_variant_id_key" ON "inventory_balances"("variant_id");
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL,
  "balance_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "reason" "InventoryReason" NOT NULL,
  "delta" INTEGER NOT NULL,
  "before" INTEGER NOT NULL,
  "after" INTEGER NOT NULL,
  "note" VARCHAR(500) NOT NULL DEFAULT '',
  "actor_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movement_consistent" CHECK ("after" = "before" + "delta" AND "after" >= 0 AND "before" >= 0)
);
CREATE UNIQUE INDEX "inventory_movements_balance_id_request_id_key" ON "inventory_movements"("balance_id", "request_id");
CREATE INDEX "inventory_movements_balance_id_created_at_idx" ON "inventory_movements"("balance_id", "created_at");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_balance_id_fkey"
  FOREIGN KEY ("balance_id") REFERENCES "inventory_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Opening balances mirror pre-existing Catalog values; this migration never
-- modifies existing products/variants or changes their advertised stock.
INSERT INTO "inventory_balances" ("id", "product_id", "on_hand", "updated_at")
  SELECT gen_random_uuid(), "id", "stock_on_hand", CURRENT_TIMESTAMP FROM "products";
INSERT INTO "inventory_balances" ("id", "variant_id", "on_hand", "updated_at")
  SELECT gen_random_uuid(), "id", "stock_on_hand", CURRENT_TIMESTAMP FROM "product_variants";
INSERT INTO "inventory_movements" ("id", "balance_id", "request_id", "reason", "delta", "before", "after", "note")
  SELECT gen_random_uuid(), "id", gen_random_uuid(), 'OPENING'::"InventoryReason", "on_hand", 0, "on_hand", 'Phase 03B migration opening stock'
  FROM "inventory_balances" WHERE "on_hand" > 0;
