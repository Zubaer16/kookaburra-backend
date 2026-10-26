# Phase 03C-2B — Persistent VPS disk storage (incremental)

Baseline: Kookaburra backend full 2026-10-26 14:06. No database migration required.
This increment **adds the `disk` provider**, keeping `cloudinary` and `s3` intact. Old asset rows keep their recorded provider. Nothing automatically moves between providers.

## Why this is VPS/Docker-only

The files reside on an absolute **persistent** mounted volume (`MEDIA_DISK_ROOT`). Never select `MEDIA_PROVIDER=disk` for Vercel/serverless deployments, throwaway Docker container layers or unbacked local temp folders. Give the API OS account exclusive write access to the volume and configure backup/restoration. Do not expose that directory via a static web server or directory listing: unpublished media is only served through the database-gated Nest controller.

## Settings

```dotenv
MEDIA_PROVIDER=disk
MEDIA_NAMESPACE=projects/kookaburra/products
MEDIA_DISK_ROOT=/srv/kookaburra-media
MEDIA_DISK_API_BASE_URL=https://api.example.com
MEDIA_DISK_PUBLIC_BASE_URL=https://api.example.com
MEDIA_DISK_UPLOAD_SECRET=GENERATE_A_DIFFERENT_RANDOM_32_PLUS_CHAR_SECRET
```

The two base URLs must be **bare origins** (no path or trailing slash). `MEDIA_DISK_API_BASE_URL` is reachable by the Admin browser; `MEDIA_DISK_PUBLIC_BASE_URL` is what the Storefront loads. A CDN may reverse-proxy `GET /v1/media/files/:id` without bypassing the API's authorization-to-publish checks; it must honor the 60-second maximum browser caching policy and should purge on deletion when a purge adapter is later configured. The origin must be HTTPS in production. On Windows, use an absolute persisted directory such as `D:\\KookaburraMedia`, ensuring the Windows account has read/write permissions.

Keep all former Cloudinary/S3 credentials configured while media records from those providers remain. Existing media deletion routes continue using persisted provider IDs and namespace. Changing `MEDIA_NAMESPACE` on an existing installation may make old files undeletable; do not change without a migration plan.

## API (JWT-only for Admin)

1. `POST /v1/admin/media/uploads` with Bearer token, `{"mimeType":"image/png","bytes":12345}`. Existing RBAC `catalog.manage` required. Response includes provider-specific `method`, `uploadUrl` and `headers`.
2. `PUT /v1/media/disk-uploads/:mediaId` with **raw image bytes**, headers `Content-Type: image/png` and `X-Media-Upload-Token` from step 1. The PUT uses a **15-minute HMAC-signed, media-specific capability**, not JWT or cookies; it checks the persisted pending asset, namespace, declared MIME and byte limit, real image signature/dimensions, and refuses overwrites. Do not log or leak the upload token. The browser supplies Content-Length automatically for a `Blob` body; do not manually attempt to set this forbidden header in fetch.
3. `POST /v1/admin/media/:mediaId/complete` with Bearer token. Re-reads the stored file, checks MIME/dimensions and verifies against the approved size/type, then changes the DB row to `ACTIVE`.
4. `PUT /v1/admin/products/:productId/media` with Bearer token to attach ordered verified images, max six.
5. Public `GET /v1/media/files/:mediaId` returns a **verified** disk image only while linked to an `ACTIVE` product. Missing/pending/unattached/detached/archive images respond with 404. Response uses `Cache-Control: public, max-age=60`, `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy: cross-origin` for a storefront hosted on a different origin. This URL is stored in existing `image`/`gallery` Storefront fields; no new frontend response contract.
6. Detach/archive/delete schedules an existing 7-day media-retention job. The `media:cleanup` worker calls disk `unlink` only when no references exist; deletion is idempotent. Run scheduled cleanup and restore backups on the VPS.

For clients: send `PUT` body as file bytes (`fetch(instruction.uploadUrl, { method: 'PUT', headers: instruction.headers, body: file })`) **after** initiating the upload through JWT authenticated Admin API. This is a signed capability: treat its token as sensitive for its 15-minute lifetime.

## Checks

```powershell
npm run check
npm run test:api:smoke
npm run test:api:db:deploy
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

DB-mode API and Swagger browser testing uses an isolated `kookaburra_api_test` DB and a randomly named **OS temporary test directory**, never a real VPS volume; `security` mode still deliberately disables all external media credentials. `api-tests/disk-media.db.spec.ts` tests signed PUT, 403 tampering, no-overwrite 409, complete 201, byte-perfect public download 200, unlinked 404 and cleanup scheduling. Unit suite tests disk atomic file creation, bad MIME, size limits, path escape, symlinks, verified deletion and provider switching. Swagger UI `visual:all` tests disk route 404 in Chromium plus the pre-existing media/gallery/Auth/RBAC regression suite; a real VPS deployment smoke test is still required.

## Explicitly deferred to Phase 03C-2C

- Resized/optimized JPEG/WebP/AVIF renditions for VPS/S3 and versioned `srcSet` contracts; these are **not generated** in 03C-2B.
- External CDN purge provider adapters (Cloudflare or equivalent) and operator reconciliation; 03C-2B uses origin/short caching only.
- Live VPS deploy/backups/restore rehearsal, disk-full recovery, multi-process concurrent upload pressure, real provider account testing and a complete security review.

No new dependencies, Prisma migrations or frontend edits. Do not represent this as production-ready without the outstanding gates.
