-- Phase 04A-1: additive customer carts. No order, payment or stock reservation.
CREATE TABLE "carts" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "cart_items" (
  "id" UUID PRIMARY KEY,
  "cart_id" UUID NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "variant_id" UUID REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cart_items_quantity_bounds" CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "cart_items_cart_product_variant_key" UNIQUE ("cart_id","product_id","variant_id")
);
-- PostgreSQL NULL semantics: composite unique alone cannot enforce simple product uniqueness.
CREATE UNIQUE INDEX "cart_items_simple_line_unique" ON "cart_items"("cart_id","product_id") WHERE "variant_id" IS NULL;
CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");
