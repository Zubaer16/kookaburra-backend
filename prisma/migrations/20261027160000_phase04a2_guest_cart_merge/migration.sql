-- 04A-2: anonymous cart capabilities (no guest account, no JWT fallback).
-- Non-destructive migration; authenticated carts and inventory unchanged.
CREATE TABLE "guest_carts" (
  "id" UUID PRIMARY KEY,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "merged_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "merged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "guest_carts_expires_at_idx" ON "guest_carts"("expires_at");
CREATE TABLE "guest_cart_items" (
  "id" UUID PRIMARY KEY,
  "guest_cart_id" UUID NOT NULL REFERENCES "guest_carts"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" UUID REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guest_cart_items_quantity_bounds" CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "guest_cart_items_line_key" UNIQUE ("guest_cart_id", "product_id", "variant_id")
);
CREATE UNIQUE INDEX "guest_cart_items_simple_line_unique"
  ON "guest_cart_items"("guest_cart_id", "product_id") WHERE "variant_id" IS NULL;
CREATE INDEX "guest_cart_items_product_id_idx" ON "guest_cart_items"("product_id");
CREATE INDEX "guest_cart_items_variant_id_idx" ON "guest_cart_items"("variant_id");
