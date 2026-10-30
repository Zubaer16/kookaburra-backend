-- G3/05B-3: additive single-store media ID references, not public URLs.
-- FK RESTRICT and media cleanup guards preserve shared, active assets.
CREATE TABLE "store_brandings" (
  "key" VARCHAR(20) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "logo_media_id" UUID,
  "favicon_media_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_brandings_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "store_brandings_primary_only" CHECK ("key" = 'primary'),
  CONSTRAINT "store_brandings_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "store_brandings_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "store_brandings_favicon_media_id_fkey" FOREIGN KEY ("favicon_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "store_brandings_logo_media_id_idx" ON "store_brandings"("logo_media_id");
CREATE INDEX "store_brandings_favicon_media_id_idx" ON "store_brandings"("favicon_media_id");
