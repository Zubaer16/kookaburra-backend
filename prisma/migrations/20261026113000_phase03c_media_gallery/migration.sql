-- Additive media and gallery schema. No existing products or stock modified.
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING_UPLOAD','ACTIVE','PENDING_DELETE','DELETED','DELETE_FAILED');
CREATE TYPE "MediaDeletionStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED');
CREATE TABLE "media_assets" (
  "id" UUID PRIMARY KEY, "provider" VARCHAR(40) NOT NULL,
  "namespace" VARCHAR(160) NOT NULL, "object_key" VARCHAR(500) NOT NULL UNIQUE,
  "provider_asset_id" VARCHAR(200), "mime_type" VARCHAR(80) NOT NULL,
  "bytes" INTEGER NOT NULL DEFAULT 0, "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0, "public_url" TEXT,
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "upload_expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_assets_size_bounds" CHECK ("bytes" >= 0 AND "bytes" <= 10485760 AND "width" >= 0 AND "height" >= 0)
);
CREATE INDEX "media_assets_status_upload_expires_at_idx" ON "media_assets"("status","upload_expires_at");
CREATE TABLE "product_media" (
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "media_id" UUID NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
  "position" INTEGER NOT NULL DEFAULT 0, "alt_text" VARCHAR(250) NOT NULL DEFAULT '',
  PRIMARY KEY ("product_id","media_id"),
  CONSTRAINT "product_media_position_bounds" CHECK ("position" >= 0 AND "position" < 6)
);
CREATE INDEX "product_media_media_id_idx" ON "product_media"("media_id");
CREATE TABLE "media_deletion_jobs" (
  "id" UUID PRIMARY KEY, "media_id" UUID NOT NULL UNIQUE REFERENCES "media_assets"("id") ON DELETE CASCADE,
  "status" "MediaDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "available_at" TIMESTAMP(3) NOT NULL,
  "claimed_at" TIMESTAMP(3), "last_error" VARCHAR(250),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "media_deletion_jobs_status_available_at_idx" ON "media_deletion_jobs"("status","available_at");
