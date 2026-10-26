-- Phase 03C-2C2: Additive manifest for actually materialized responsive objects.
-- Existing media and product records remain unchanged.
ALTER TABLE "media_assets" ADD COLUMN "renditions" JSONB;
