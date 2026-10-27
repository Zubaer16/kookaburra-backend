-- Phase 04B-2: bounded reservations, never a physical stock decrement or order.
ALTER TABLE "inventory_balances" ADD COLUMN "reserved_quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_reserved_bounds"
  CHECK ("reserved_quantity" >= 0 AND "reserved_quantity" <= "on_hand");
CREATE TYPE "CheckoutReservationStatus" AS ENUM ('ACTIVE','RELEASED','EXPIRED');
CREATE TABLE "checkout_reservations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "cart_id" UUID NOT NULL REFERENCES "carts"("id") ON DELETE RESTRICT,
  "request_id" UUID NOT NULL,
  "status" "CheckoutReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "country_code" VARCHAR(2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "subtotal_minor" INTEGER NOT NULL,
  "shipping_minor" INTEGER NOT NULL,
  "tax_minor" INTEGER NOT NULL,
  "estimated_total_minor" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "released_at" TIMESTAMP(3),
  CONSTRAINT "checkout_reservation_country_format" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "checkout_reservation_money_bounds" CHECK ("subtotal_minor" >= 0 AND "shipping_minor" >= 0 AND "tax_minor" >= 0 AND "estimated_total_minor" >= 0)
);
CREATE UNIQUE INDEX "checkout_reservations_customer_request_key" ON "checkout_reservations"("customer_id","request_id");
-- Only one active hold per customer cart; expiry state is transitioned transactionally before replacement.
CREATE UNIQUE INDEX "checkout_reservations_one_active_cart" ON "checkout_reservations"("cart_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "checkout_reservations_status_expires_at_idx" ON "checkout_reservations"("status","expires_at");
CREATE TABLE "checkout_reservation_lines" (
  "id" UUID NOT NULL PRIMARY KEY,
  "reservation_id" UUID NOT NULL REFERENCES "checkout_reservations"("id") ON DELETE CASCADE,
  "balance_id" UUID NOT NULL REFERENCES "inventory_balances"("id") ON DELETE RESTRICT,
  "product_id" UUID NOT NULL,
  "variant_id" UUID,
  "quantity" INTEGER NOT NULL,
  "unit_price_minor" INTEGER NOT NULL,
  CONSTRAINT "checkout_reservation_line_qty_bounds" CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "checkout_reservation_line_price_bounds" CHECK ("unit_price_minor" >= 0)
);
CREATE INDEX "checkout_reservation_lines_balance_id_idx" ON "checkout_reservation_lines"("balance_id");
