-- Additive 04D-2A return/inspection ledger; refunds and payments are untouched.
CREATE TYPE "OrderReturnStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','RECEIVED_RESTOCKABLE','RECEIVED_DAMAGED','RESTOCKED');
CREATE TABLE "order_returns" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" VARCHAR(32) NOT NULL,
  "status" "OrderReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_returns_order_request_key" UNIQUE ("order_id", "request_id"),
  CONSTRAINT "order_returns_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_returns_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "order_returns_order_line_id_status_idx" ON "order_returns"("order_line_id","status");
CREATE INDEX "order_returns_order_id_created_at_idx" ON "order_returns"("order_id","created_at");
CREATE TABLE "order_return_events" (
  "id" UUID NOT NULL,
  "return_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "action" VARCHAR(24) NOT NULL,
  "action_hash" VARCHAR(64) NOT NULL,
  "status" "OrderReturnStatus" NOT NULL,
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_return_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_return_events_return_request_key" UNIQUE ("return_id", "request_id"),
  CONSTRAINT "order_return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "order_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "order_return_events_return_id_created_at_idx" ON "order_return_events"("return_id","created_at");
