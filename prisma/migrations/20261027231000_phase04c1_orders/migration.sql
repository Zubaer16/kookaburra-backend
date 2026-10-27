-- Phase 04C-1: a time-limited unpaid order owns a stock allocation.
-- No physical stock movement, existing reservation/history is preserved.
ALTER TYPE "CheckoutReservationStatus" ADD VALUE 'CONSUMED';
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CANCELLED', 'EXPIRED');
CREATE TABLE "orders" (
  "id" UUID NOT NULL PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "cart_id" UUID NOT NULL REFERENCES "carts"("id") ON DELETE RESTRICT,
  "reservation_id" UUID NOT NULL REFERENCES "checkout_reservations"("id") ON DELETE RESTRICT,
  "request_id" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "country_code" VARCHAR(2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "subtotal_minor" INTEGER NOT NULL,
  "shipping_minor" INTEGER NOT NULL,
  "tax_minor" INTEGER NOT NULL,
  "total_minor" INTEGER NOT NULL,
  "shipping_address" JSONB NOT NULL,
  "payment_deadline_at" TIMESTAMP(3) NOT NULL,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_amount_bounds" CHECK (
    "subtotal_minor" >= 0 AND "shipping_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0
    AND "subtotal_minor"::bigint + "shipping_minor" + "tax_minor" = "total_minor"
  ),
  CONSTRAINT "orders_country_format" CHECK ("country_code" ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX "orders_reservation_id_key" ON "orders"("reservation_id");
CREATE UNIQUE INDEX "orders_customer_request_key" ON "orders"("customer_id", "request_id");
CREATE INDEX "orders_status_payment_deadline_at_idx" ON "orders"("status", "payment_deadline_at");
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");
CREATE TABLE "order_lines" (
  "id" UUID NOT NULL PRIMARY KEY,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL,
  "variant_id" UUID,
  "title_snapshot" VARCHAR(250) NOT NULL,
  "sku_snapshot" VARCHAR(120),
  "options_snapshot_json" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  "line_total_minor" INTEGER NOT NULL,
  CONSTRAINT "order_lines_qty_price_bounds" CHECK (
    "quantity" BETWEEN 1 AND 99 AND "unit_price_minor" >= 0
    AND "line_total_minor" >= 0
    AND "quantity"::bigint * "unit_price_minor" = "line_total_minor"
  )
);
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");
CREATE TABLE "order_status_events" (
  "id" UUID NOT NULL PRIMARY KEY,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "status" "OrderStatus" NOT NULL,
  "reason" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "order_status_events_order_id_created_at_idx" ON "order_status_events"("order_id", "created_at");
