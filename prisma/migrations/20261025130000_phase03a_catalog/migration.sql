-- Phase 03A: additive catalog data fields; retains all Phase 02 products and IDs.
-- Local PostgreSQL migration only; back up existing database before applying.
ALTER TABLE "categories" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN "sku" VARCHAR(120);
ALTER TABLE "products" ADD COLUMN "compare_at_minor" INTEGER;
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
ALTER TABLE "products" ADD CONSTRAINT "products_compare_at_valid"
  CHECK ("compare_at_minor" IS NULL OR "compare_at_minor" > "price_minor");
