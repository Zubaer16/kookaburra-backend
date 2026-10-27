# Kookaburra v2 — Phase 03C-3: Media Lifecycle Reconciliation

## Scope

This increment adds a **read-only-by-default** operator command for pre-existing media lifecycle drift. It makes **no** change to HTTP routes, JWT/RBAC, the storage adapters, the existing responsive-image API, or Prisma migrations.

- Detect old, verified `ACTIVE` assets **in the configured `MEDIA_NAMESPACE`** that have no `product_media` reference and have not been updated for at least seven days.
- With `--apply`, schedule those images for deletion after **another seven-day retention period**, preserving the undo window. Shared/reference-linked assets are not scheduled.
- Detect `PENDING_DELETE` images without a deletion job, or with a `CANCELLED`/`COMPLETED` job that is inconsistent with the asset status. With `--apply`, safely recreate/reactivate the job. This only schedules storage operations: **it never deletes files directly**.
- Leave `PENDING` and `PROCESSING` cleanup jobs to the existing cleanup worker, and leave `FAILED` jobs for explicit operator review/retry. Report failed deletion assets without silently re-enabling failed jobs.
- Use a row lock and transaction to check state/references a second time before mutation; attach, replace and cleanup use the same media row-lock convention.
- Keep unfinished uploads under the existing `media:cleanup` flow. Restrict the expired-upload scan to the configured namespace.

## Windows commands

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"

# Check state; does not change DB or provider storage.
npm run media:reconcile

# Preview a bounded page of candidates, read-only.
npm run media:reconcile -- --limit=25

# Only if the report is expected and the target database/namespace is verified.
npm run media:reconcile -- --apply

# The existing workers remain separate operations.
npm run media:renditions
npm run media:cleanup
```

`--apply` does **not** bypass retention and is not a substitute for `media:cleanup`. Review `.env`/`DATABASE_URL`/`MEDIA_NAMESPACE` before applying in any environment. A reported count can be capped by the chosen limit; repeat runs may be required when the count reaches that limit. Both workers require reliable scheduling in production. All database changes remain limited to media-specific records and system audit events.

## Validation

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

The new real-DB test uses isolated `kookaburra_api_test`. It verifies preview is read-only, aged orphan scheduling, non-expired/fresh/shared/other-namespace exclusions, missing and cancelled-job recovery, retention, idempotency, and preservation of failed jobs. The unit test verifies explicit CLI opt-in and validation. No new HTTP Swagger operation was introduced; the existing entire Swagger browser regression suite remains required.

## Release gate that remains open

Automated tests cannot replace a controlled real Cloudinary, S3/R2 and VPS deployment exercise, provider deletion/purge confirmations, worker scheduling health, and restore/backups. Verify the active provider and historical provider credentials before processing real media. Never treat a successful CDN purge request as proof all downstream caches have expired.
