-- G1 / 04D-2B-1: additive, no existing orders, refunds or returns modified.
-- An authorized replacement does not reserve or change stock. Dispatch deducts once.
ALTER TYPE "InventoryReason" ADD VALUE IF NOT EXISTS 'REPLACEMENT';
CREATE TYPE "ReplacementStatus" AS ENUM ('AUTHORIZED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TABLE "order_replacements" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "return_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "product_id" UUID NOT NULL,
  "variant_id" UUID,
  "sku_snapshot" VARCHAR(120),
  "quantity" INTEGER NOT NULL,
  "status" "ReplacementStatus" NOT NULL DEFAULT 'AUTHORIZED',
  "carrier" VARCHAR(80),
  "tracking_number" VARCHAR(120),
  "shipped_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_replacements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_replacements_return_id_key" UNIQUE ("return_id"),
  CONSTRAINT "order_replacements_order_request_key" UNIQUE ("order_id", "request_id"),
  CONSTRAINT "order_replacements_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_replacements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_replacements_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "order_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "order_replacements_order_id_created_at_idx" ON "order_replacements"("order_id", "created_at");
CREATE TABLE "order_replacement_events" (
  "id" UUID NOT NULL,
  "replacement_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "action" VARCHAR(20) NOT NULL,
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_replacement_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_replacement_events_request_key" UNIQUE ("replacement_id", "request_id"),
  CONSTRAINT "order_replacement_events_replacement_id_fkey" FOREIGN KEY ("replacement_id") REFERENCES "order_replacements"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "order_replacement_events_replacement_id_created_at_idx" ON "order_replacement_events"("replacement_id", "created_at");
