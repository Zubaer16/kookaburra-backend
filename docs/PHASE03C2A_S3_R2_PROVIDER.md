# Phase 03C-2A — S3/R2 storage and historical-provider-safe switching

**Baseline:** `kookaburra-backend-full-20261026-122027.zip`. Incremental `.tar.gz` overlay; no DB schema migration. Admin and Storefront repositories unchanged.

**This increment covers:** AWS S3 and Cloudflare R2 using S3-compatible SigV4 HTTPS signed `PUT`, verified media readback, idempotent delete, provider registry routing by _persisted asset provider_, safe namespace / reference checks, unit / DB / Swagger contract coverage. **Persistent VPS disk adapter and responsive renditions are not yet implemented.**

## One installation; one default for new uploads

`MEDIA_PROVIDER=cloudinary` remains default. With `MEDIA_PROVIDER=s3`, new media records store `provider='s3'`, while older rows keep `provider='cloudinary'`. `completeUpload` and `cleanupBatch` resolve the adapter from the **stored** provider, not the newly configured default. Retain Cloudinary credentials until old assets are deleted/migrated; changing default alone does **not** migrate objects, links, or CDN URLs. `MEDIA_NAMESPACE` must stay stable per installation.

S3/R2 configuration (use only project/client-owned credentials and storage; never paste keys into chat or commit `.env`):

```dotenv
MEDIA_PROVIDER=s3
MEDIA_NAMESPACE=projects/kookaburra/products
# AWS: https://s3.us-east-1.amazonaws.com, region us-east-1
# R2:  https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com, region auto
MEDIA_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
MEDIA_S3_BUCKET=your-bucket
MEDIA_S3_REGION=us-east-1
MEDIA_S3_ACCESS_KEY_ID=YOUR_ACCESS_KEY
MEDIA_S3_SECRET_ACCESS_KEY=YOUR_SECRET
# Public URL should map to the *root of the bucket*, with correct MIME and CORS.
MEDIA_S3_PUBLIC_BASE_URL=https://images.example.com
```

**Security requirements**: HTTPS-only endpoint/CDN, no endpoint URL credentials, path, query, or redirects. Use least-privilege object permission limited to the selected bucket/project prefix (the SigV4 signer uses path-style URLs). Configure storage bucket CORS to permit browser PUT from the allowed Admin origin with `Content-Type` and `If-None-Match`; do not grant public write access. Only verified product image objects should be attached. Configure CDN read access separately; do not expose storage credentials.

## Upload API (old routes unchanged)

1. Admin with `catalog.manage`: `POST /v1/admin/media/uploads`, e.g. `{ "mimeType": "image/png", "bytes": 1024 }`.
2. Response now contains **additive** `method` and `headers` fields. **Cloudinary** uses `method: "POST"`, `headers: {}` and signed `fields` for `multipart/form-data` with a `file` part, as before. **S3/R2** uses `method: "PUT"`, `headers: { "Content-Type": "image/png", "If-None-Match": "*" }` (both signed to prevent a replay overwriting a verified image), and `fields: {}`. PUT image bytes as the request body _to exactly the returned uploadUrl_, not to the API; the URL signature binds MIME and expires in one hour.
3. `POST /v1/admin/media/{id}/complete`: API first requests authenticated SigV4 `HEAD` and bounded `GET` from storage. Checks file size (max 10 MiB), actual PNG/JPEG/WebP file signature and dimensions (max 12k), S3 Content-Type, and matches the originally requested MIME/type and size bound. Returns safe metadata only; never trusts browser-provided URL or object ID.
4. `PUT /v1/admin/products/{id}/media`: existing maximum six image, shared reference, order and orphan cleanup logic unchanged.

**Format note:** Cloudinary supports JPEG/PNG/WebP/AVIF. S3/R2 accepts **JPEG/PNG/WebP**, but currently refuses AVIF at upload-start. Metadata sniffing verifies file signatures and dimensions; it is **not equivalent to full image decoding or malware scanning**. Production deployments requiring arbitrary AVIF support or intensive malicious-media defenses need a full decoder/processor in a separate increment.

**Size note:** A signed PUT cannot itself enforce the declared byte count on S3/R2. Unwanted or larger remote objects are rejected on completion, and expired unattached uploads are reconciled by scheduled cleanup; add per-bucket upload size/quotas and monitor orphan volumes. Client delivery of an object before finalization depends on bucket/CDN settings; this is not an access-controlled private upload implementation.

## Durable cleanup and cache behavior

- Continue scheduling `npm run media:cleanup` on the correct installation with **both old and new providers' credentials** until migrated/expired items are deleted.
- The existing 7-day retention, atomic reference checks, durable job claims, retries and operator retry remain unchanged. Deletion uses the persisted provider and key. Remote deletion is confirmed by 2xx (or 404 already absent).
- S3/R2 object-origin delete does **not automatically invalidate an external CDN cache**; configure short CDN TTL/purge integration before guaranteeing a specific public removal deadline. This is **not** a complete CDN invalidation implementation.
- Cloudinary delete still requests its existing `invalidate: true` behavior.
- Neither S3/R2 nor Cloudinary has been exercised live in this build container; test first with isolated nonproduction storage and local test DB. The supplied isolated API tests never use real storage credentials.

## Windows steps

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2a-s3-r2-provider-20261026.tar.gz" -C .
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

No Prisma migration required. Do not migrate, reset, or delete any production database for this patch. Keep local test DB `kookaburra_api_test` isolated as before.

## Phase 03C-2B backlog

Persistent VPS disk adapter with authenticated byte upload and safe private/public delivery; full decoding and responsive renditions; CDN purge adapter; live provider switching and real object upload/delete acceptance tests. Implement before calling the entire 03C media-storage milestone production-ready.
