-- A2: additive, non-destructive Frontend/Admin catalog metadata.
-- Existing records retain their identity, price, SKU and inventory.
ALTER TABLE "categories"
  ADD COLUMN "color" VARCHAR(7) NOT NULL DEFAULT '#EAF0FF',
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "products"
  ADD COLUMN "badge" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "tag" VARCHAR(16);
ALTER TABLE "categories" ADD CONSTRAINT "categories_sort_order_nonnegative" CHECK ("sort_order" >= 0);
ALTER TABLE "categories" ADD CONSTRAINT "categories_color_hex" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "products" ADD CONSTRAINT "products_tag_valid" CHECK ("tag" IS NULL OR "tag" IN ('new', 'popular', 'sale'));
CREATE INDEX "categories_public_sort_idx" ON "categories"("active", "sort_order", "name");
CREATE INDEX "products_tag_idx" ON "products"("tag");
