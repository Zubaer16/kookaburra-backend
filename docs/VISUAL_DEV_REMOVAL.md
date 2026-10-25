# Phase 03A — Retire Swagger visual:dev inspection mode

The old `test:api:visual:dev` created two persistent inspection accounts per
run in the **local development** PostgreSQL DB (`kookaburra-api-dev`). It
was a browser demonstration, not essential regression coverage.

All useful Auth negative Swagger execution steps were migrated to
`swagger-ui-tests/all-endpoints.db.spec.ts`: invalid registration (400),
duplicate registration (409), wrong password (401), logout/refresh rejection
(401), customer denied Admin login (401), and customer JWT denied Admin
profile (403). The existing positive Auth flows and Phase 03A Catalog browser
tests remain in `test:api:visual:all`.

## Patch application / remove legacy test files

After extracting the `.tar.gz` patch at repository root, run PowerShell:

```powershell
Remove-Item -LiteralPath 'scripts/run-api-dev-inspect.cjs' -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'swagger-ui-tests/dev-database.inspect.spec.ts' -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'docs/VISUAL_LOCAL_DEV_DATABASE.md' -ErrorAction SilentlyContinue
```

All three paths are exact and scoped to the repository; they are not needed
by the remaining scripts. The archive itself cannot delete old source files.

## Existing inspection data: preview FIRST

Stop your local API and other writers before cleanup. Take a PostgreSQL
backup of `kookaburra-api-dev`. This operation is not needed for new tests.

```powershell
npm run cleanup:visual-dev:preview
```

The script reads **only** repository `.env`, refuses remote addresses or any
DB other than localhost `kookaburra-api-dev`, and prints candidate accounts
without exposing credentials. Only the exact random-UUID email pattern
`visual-dev-(customer|staff)-<uuid>@example.test` with expected roles is
considered. It also checks each candidate's audit event types. A database
transaction protects apply mode; unexpected rows/foreign-key references
cause a rollback rather than deleting unrelated data.

Once you inspect the candidate count and identities and confirm they are
only the old inspection users, explicitly apply:

```powershell
npm run cleanup:visual-dev:apply
```

This permanently deletes ONLY the selected inspection users, their
`auth_sessions` and their own login-only `audit_events` in one PostgreSQL
transaction. It does NOT delete any other user, customer, product, category,
order, migration, or table. A DB backup remains the recovery option.

**Do not apply** if you have used one of those inspection accounts for
anything other than the historical Swagger walkthrough; contact the developer
to inspect it separately. If preview shows zero candidates, there is no old
inspection account data to remove. No migration is required.

## Verification

```powershell
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
```

`test:api:visual:all` requires the usual guarded `kookaburra_api_test`
connection and Chromium, and never uses your normal development DB.
