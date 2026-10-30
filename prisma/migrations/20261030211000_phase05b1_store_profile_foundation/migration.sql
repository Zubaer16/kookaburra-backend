-- G3/05B-1. Additive single-installation store identity/profile. No seed/demo branding.
-- No existing order, payment, shipping, user or audit history is rewritten.
CREATE TABLE "store_profiles" (
  "key" VARCHAR(20) NOT NULL,
  "store_name" VARCHAR(70) NOT NULL,
  "support_email" VARCHAR(120) NOT NULL,
  "website_url" VARCHAR(200) NOT NULL DEFAULT '',
  "timezone" VARCHAR(64) NOT NULL,
  "support_notice" VARCHAR(180) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_profiles_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "store_profiles_primary_only" CHECK ("key" = 'primary')
);
