-- Phase 05A-1: additive, customer-scoped persistent wishlist. No existing rows modified.
CREATE TABLE "wishlist_items" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id","product_id")
);
CREATE INDEX "wishlist_items_user_id_created_at_idx" ON "wishlist_items"("user_id", "created_at");
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
