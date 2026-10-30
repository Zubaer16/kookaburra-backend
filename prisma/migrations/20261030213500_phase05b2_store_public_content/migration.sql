-- G3/05B-2: additive plain-text public SEO/footer/policy content.
-- Never rewrite store_profiles, original orders, returns, audit or media history.
CREATE TABLE "store_contents" (
  "key" VARCHAR(20) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "seo_title" VARCHAR(70) NOT NULL DEFAULT '',
  "seo_description" VARCHAR(180) NOT NULL DEFAULT '',
  "footer_text" VARCHAR(240) NOT NULL DEFAULT '',
  "privacy_policy" TEXT NOT NULL DEFAULT '',
  "terms_of_service" TEXT NOT NULL DEFAULT '',
  "return_policy" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_contents_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "store_contents_primary_only" CHECK ("key" = 'primary'),
  CONSTRAINT "store_contents_revision_positive" CHECK ("revision" > 0)
);
