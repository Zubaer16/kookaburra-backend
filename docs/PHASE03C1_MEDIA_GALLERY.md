# Phase 03C-1 — Media Management & Product Gallery

**Baseline:** `kookaburra-backend-full-20261026-111702.zip` (26 October 2026). Apply this incremental `.tar.gz` overlay to that version, not older repositories.

**Status:** Implementation package; `npm run check`, real Postgres/Playwright and real Cloudinary upload/delete verification are **pending on Windows**. Frontends are unchanged. This is a first 03C increment, **not the completion of all provider adapters/renditions**.

## Supported media lifecycle

- Storage provider **interface**, with actual **Cloudinary** signed-upload / resource verification / destroy implementation. S3/R2/persistent-VPS adapters are a subsequent increment and are **not yet implemented**.
- `POST /v1/admin/media/uploads` (catalog.manage JWT): `{ "mimeType": "image/png", "bytes": 2048 }`. Responds with an hour-limited signed Cloudinary `uploadUrl`, `fields`, `mediaId` and expiry. Uses server-generated object key in isolated `MEDIA_NAMESPACE`. Client uploads `multipart/form-data` directly to **that URL**, including returned fields **plus a `file` field** containing image bytes. **Never send Cloudinary API secret to browser**. Max advertised size 10 MiB; JPEG/PNG/WebP/AVIF.
- `POST /v1/admin/media/:id/complete`: server queries the provider Admin API independently; checks object key, asset ID, type, bytes, dimensions and secure URL. No client-provided provider IDs/URLs accepted. Image cannot be attached before verified.
- `GET /v1/admin/media/:id`: status + safe metadata only; provider object IDs and credentials never returned.
- `PUT /v1/admin/products/:id/media`: atomically replaces ordered `items` (`mediaId`, `position`, optional `altText`), up to 6 images; positions must be consecutive 0..N-1. Supports shared image references; rejects unverified/deleting media. `[]` detaches all. Pending unprocessed deletion can be cancelled by reattaching within retention.
- Public/Admin catalog product JSON returns `image` (cover URL or `null`), `gallery` (ordered `src`, `alt`, media ID, dimensions), and `images` (Admin-friendly alias) alongside existing product fields. The presentation intentionally excludes raw media/private provider identifiers.
- `DELETE /v1/admin/media/:id`: rejects attached/shared assets; schedules 7-day retained deletion for unattached assets.
- Product `DELETE` archive and `PATCH status=ARCHIVED` detach image references; only images with **zero remaining references** are queued for deletion. Product rows, variants, SKU, inventory and historical identifiers remain.
- `GET /v1/admin/media-deletion-jobs`: inspect non-secret deletion state, attempts and generic errors. `POST /v1/admin/media-deletion-jobs/:id/retry`: explicitly requeue a failed unreferenced asset.

## Durable processing (mandatory for actual file cleanup)

Use an **external scheduler** (e.g. supported scheduled function or VPS/Windows Task Scheduler) to run:

```powershell
npm run media:cleanup
```

The command is one **bounded batch** (20 jobs per invocation), not a long-lived or unawaited HTTP background promise. Configure `DATABASE_URL`, JWT secret and the correct media provider environment; ensure it runs on the correct installation. It:

1. Schedules expired/unattached signed uploads for cleanup after grace.
2. Claims eligible jobs with database locks and states to prevent double deletion.
3. Checks **stored** provider + namespace + object key; never accepts a user-supplied delete URL.
4. Uses Cloudinary destroy with `invalidate=true`, treating a verified missing resource as already deleted.
5. On a transient failure records a generic error, exponential backoff and up to 5 attempts; exhausted jobs remain FAILED/DELETE_FAILED for operator inspection/retry.
6. Checks shared-reference count again **at claim time**. A claimed media asset cannot be reattached while remote deletion is in progress.

Deletion is **eventual**, not instantaneous: default retention 7 days plus next successful scheduled job. Provider CDN invalidation and browser caches may persist temporarily. Configure actual worker scheduling before promising end-users automatic removal.

## Setup

Only add these to the development `.env` after you have an isolated Cloudinary account/folder for your project:

```dotenv
MEDIA_CLOUD_NAME=your_cloud_name
MEDIA_API_KEY=your_key
MEDIA_API_SECRET=your_secret
MEDIA_NAMESPACE=projects/kookaburra/products
```

Use a different namespace and separate credentials **for each client installation**. Do not commit `.env`, test with production data, or paste credentials into chat. Without Cloudinary credentials, upload start is intentionally HTTP `503`; other DB/Swagger tests use synthetic verified metadata only in **isolated local `kookaburra_api_test`** and do not call the real provider. A successful test-DB gallery assertion **does not** prove real Cloudinary delivery/deletion.

## Apply and verify — PowerShell

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c1-media-gallery-20261026.tar.gz" -C .
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

**Backup local `kookaburra-api-dev` before applying migration**. The SQL migration is additive and has no DROP/TRUNCATE or global DELETE. Never call `prisma migrate reset` or migrate against the wrong database. `test:api:db:deploy` only targets a verified, independent localhost PostgreSQL database named `kookaburra_api_test`.

The API tests runner forcibly strips Cloudinary credentials from test processes. API/Swagger tests cover JWT/RBAC, validation, read-model privacy, shared reference protection, detach/restore, delayed deletion, real DB consistency, and documented Swagger execution. Provider signing/verify/delete have Jest mocks; **manual Cloudinary sandbox smoke is still required** after local tests pass.

## Pending Phase 03C-2

- Implement S3/R2/VPS storage provider adapters and test provider switching and recoverability.
- Configure and acceptance-test scheduled deletion in actual deployment, not just local one-shot worker command.
- Responsive renditions, image processing, final cache invalidation behavior, and frontend UI integration/preview.
- Security and operational audit for each chosen client deployment and real provider.
