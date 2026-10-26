# Phase 03C-2C1 — Responsive Cloudinary delivery and optional CDN cache purge

Baseline: `kookaburra-backend-full-20261026-155054.zip`. Apply this `.tar.gz` as an incremental overlay. Keep all existing migrations and database content; **no new Prisma migration**.

## What is implemented

- Public product `gallery[]` / `images[]`, as well as the Admin gallery-replacement response, include `srcSet` and `sizes` **only** when the image has a verified Cloudinary URL that contains a versioned `/image/upload/v.../` path and the source width is large enough. Fixed width candidates: 320, 480, 640, 960, 1280, 1600 px, never wider than the verified original. Each uses Cloudinary `f_auto,q_auto,w_<width>` transformations. Existing `image`, `src`, `url`, `width`, `height`, `alt`, and `position` fields are unchanged. Frontends may use `srcSet` if present; otherwise `src` works as before.
- For S3/R2 and disk, **no artificial srcSet is returned**. Actual image resizing and derived-object lifecycle requires an image processor/durable worker; it is explicitly not claimed in this increment.
- On successful deletion from **S3/R2 or disk**, the existing durable cleanup worker also calls the optional Cloudflare zone `purge_cache` API for the asset's single verified public URL. It first checks the stored namespace, stored provider, and reconstructed provider-specific URL to reject arbitrary URLs. If purge fails, cleanup retains its existing retry/dead-letter behavior; provider deletion is idempotent. A Cloudflare `success: true` result confirms that the purge request was accepted, not that every edge location has already been independently checked. Assets shared by multiple products are not deleted or purged.
- Cloudinary already uses `invalidate=true` on its provider destroy API and is **not** double-purged through Cloudflare.
- Without a configured Cloudflare zone/token, S3/disk deletion still proceeds; external cached copies can remain until TTL expiry. Disk API still uses a short 60-second cache TTL. Nothing can guarantee already-cached browser copies are erased.

## Optional Cloudflare configuration

```dotenv
MEDIA_CDN_CF_ZONE_ID=
MEDIA_CDN_CF_API_TOKEN=
```

Leave both blank to disable the integration. Supply both to enable. Use a Cloudflare API token scoped to the correct zone with Cache Purge permission. The zone must actually serve the configured `MEDIA_S3_PUBLIC_BASE_URL` or `MEDIA_DISK_PUBLIC_BASE_URL`. Protect these settings as server secrets. Do not put credentials in client-side JavaScript, logs, or Git. When changing a provider, preserve credentials and public-base settings for old assets until their cleanup jobs complete. A wrong zone/token will produce retryable cleanup failures.

## Known limitations / next subphase

- Responsive delivery for **S3/R2/VPS** is not implemented yet: do not advertise a nonexistent resized rendition. Requires Sharp (or another actual image processor), safe bounded transformation, a durable rendition queue, stored derived-object metadata and transactional cleanup of original plus derivatives.
- Cloudflare purge currently targets the **one verified original URL**, not hypothetical future S3/disk renditions. If an external CDN generates its own URLs for derivatives, those paths need their own purge configuration.
- Cloudinary URL derivation only recognizes the conventional versioned uploaded-image path. A different URL layout gracefully falls back to original `src`.
- Cloudflare purge is an optional provider-specific integration, not a generic promise that every CDN supports purge-by-URL.

## Testing (Windows PowerShell)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2c1-responsive-cdn-20261026.tar.gz" -C .
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

Tests rely on mocks for Cloudflare; a live cache purge needs explicit end-to-end verification on an owned CDN zone before production use. Existing Postgres test DB remains `kookaburra_api_test`, and should never be reset or pointed to production.
