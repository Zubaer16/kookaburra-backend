-- 04B-1: country/currency rate configuration. No seeded rate: unset is NOT free.
-- Back up development DB before deploy. No user/cart/inventory records changed.
CREATE TABLE "checkout_rates" (
  "id" UUID NOT NULL PRIMARY KEY,
  "country_code" VARCHAR(2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "shipping_minor" INTEGER NOT NULL,
  "free_over_subtotal_minor" INTEGER,
  "tax_bps" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checkout_rates_country_format" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "checkout_rates_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "checkout_rates_shipping_bounds" CHECK ("shipping_minor" BETWEEN 0 AND 2147483647),
  CONSTRAINT "checkout_rates_free_threshold_bounds" CHECK ("free_over_subtotal_minor" IS NULL OR "free_over_subtotal_minor" BETWEEN 0 AND 2147483647),
  CONSTRAINT "checkout_rates_tax_bounds" CHECK ("tax_bps" BETWEEN 0 AND 10000)
);
CREATE UNIQUE INDEX "checkout_rates_country_currency_key" ON "checkout_rates"("country_code", "currency");
