# Kookaburra v2 — Phase 03C-2C2: Real S3/R2 + VPS image renditions

## Scope and design

- Generates actual 320/480/640/960/1280/1600 px **WebP** derivatives, never upscaled past the verified original's recorded width.
- Requires `sharp@0.35.5` (new production dependency). This patch includes a change to `package.json`, but the developer **must run `npm install sharp@0.35.5 --save --save-exact`** after overlay to update `package-lock.json` and install platform-specific binaries, then commit both files.
- Uses existing PostgreSQL `outbox_events`: one durable job per verified S3/R2 or VPS asset, keyed by its UUID; the worker can be retried independently of the HTTP request. No unawaited work in request handlers.
- Adds `media_assets.renditions JSONB` through one **additive Prisma migration**. Entries describe only completed derived media (`width` and `bytes`); no credentials or client-provided URLs are stored.
- Source bytes are read through provider-owned methods, checked against verified MIME/size/dimensions and decoded with bounded `sharp` input pixels.
- S3 keys: `<original-object-key>-r/w_<width>.webp`. Signed server-to-S3 PUT uses `If-None-Match: *`. A retry compares already-uploaded contents and never overwrites different content.
- Disk paths: `<original-path>-r/w_<width>.webp`, created without replacing the original and served by the existing publication gate using `GET /v1/media/files/:id?width=320` (etc). Query values outside the supported set return HTTP 400; unpublished/missing renditions return 404.
- Public `gallery[].srcSet` is emitted **only if valid DB rendition entries are present**; until then, product images retain the original URL. Cloudinary transformations stay unchanged. S3/R2 and disk output are not fabricated.
- Cleanup attempts to delete every possible generated key (even partially written files from a failed worker), deletes original, and sends Cloudflare purge for original plus derived URLs. Failed deletion/purge remains in the existing durable retry path. Shared media is never deleted while still referenced.
- The deletion worker skips media with an actively PROCESSING rendition job; after the rendition finishes, cleanup can safely remove all generated objects.

## Apply and migrate (local Windows)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2c2-real-renditions-20261026.tar.gz" -C .
# This updates package-lock.json and downloads the correct Windows sharp binaries.
npm install sharp@0.35.5 --save --save-exact
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
```

**Backup `kookaburra-api-dev` first.** Use the existing isolated test DB `kookaburra_api_test`. Do not reset databases. Never point automated tests at live/Neon databases.

## Regression tests

```powershell
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

## Run the worker

```powershell
npm run media:renditions
npm run media:cleanup
```

- `media:renditions` backfills pending S3/R2 and disk originals in bounded batches, then processes at most ten jobs per call. Schedule it periodically on **a VPS or approved scheduled job / managed durable worker**; the HTTP process does not launch it asynchronously. One run does not guarantee the entire backlog has been processed. Inspect pending/failed `media.renditions` rows in `outbox_events` operationally.
- The original media remains usable if a rendition job fails. After five unsuccessful attempts the outbox row is FAILED; operator review and explicit requeue are needed. This phase does not yet expose a dedicated safe retry/reconciliation admin endpoint for failed rendition jobs.
- After changing providers, keep old provider credentials configured until old assets and derivatives have been cleaned up; provider identity is persisted per asset. Changes to default storage do not migrate existing media.

## Limitations / required release checks

- `sharp` cannot be installed or run in this delivery environment; full TypeScript/Jest/DB/Chromium checks and real S3/R2/VPS uploads must be run on the user's Windows/target environment.
- Responsive renditions are generated asynchronously, not atomically with original upload; no `srcSet` is returned before the whole manifest commits.
- For a genuine S3/R2 deployment, confirm object storage CORS, bucket policies, media CDN cache rules, and signed upload/derived-file permissions; test real R2/S3 PUT, verification, CDN behavior, deletion, and retry against client-owned test storage before production.
- Cloudflare success acknowledges purge request rather than global immediate eviction; provider-specific CDN caches might need additional configuration.
- Worker crash recovery uses a 30-minute processing lease; configure workers to avoid overlapping long runs. The generated derivative manifest is fixed-version; upgrading formats/widths later requires a deliberate reprocessing migration.
- This is an implementation and local test candidate, **not** a claim of production readiness or verified cross-platform deployment.
