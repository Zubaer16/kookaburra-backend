-- Additive shipment tracking. No order/stock/payment mutation.
CREATE TYPE "FulfillmentStatus" AS ENUM ('PROCESSING','SHIPPED','DELIVERED');
CREATE TABLE "order_shipments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "status" "FulfillmentStatus" NOT NULL DEFAULT 'PROCESSING',
  "carrier" VARCHAR(80),
  "tracking_number" VARCHAR(120),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "shipped_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_shipments_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "order_shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_shipments_progress_check" CHECK (
    ("status" = 'PROCESSING' AND "shipped_at" IS NULL AND "delivered_at" IS NULL) OR
    ("status" = 'SHIPPED' AND "shipped_at" IS NOT NULL AND "delivered_at" IS NULL AND "carrier" IS NOT NULL AND "tracking_number" IS NOT NULL) OR
    ("status" = 'DELIVERED' AND "shipped_at" IS NOT NULL AND "delivered_at" IS NOT NULL AND "carrier" IS NOT NULL AND "tracking_number" IS NOT NULL)
  )
);
CREATE INDEX "order_shipments_status_started_at_idx" ON "order_shipments"("status","started_at");
CREATE TABLE "order_shipment_events" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "status" "FulfillmentStatus" NOT NULL,
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_shipment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "order_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_shipment_events_order_request_key" UNIQUE ("order_id","request_id")
);
CREATE INDEX "order_shipment_events_shipment_id_created_at_idx" ON "order_shipment_events"("shipment_id","created_at");
