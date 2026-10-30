# G3 / 05B-1 — Store Profile Foundation (Backend Only)

Overlay: `KOOKABURRA_G3_PHASE05B1_STORE_PROFILE_OVERLAY.tar.gz` (root-level incremental).

Status: **SOURCE PREPARED / LOCAL ACCEPTANCE PENDING**, 2026-10-30. Source baseline: `kookaburra-backend-full-20261030-203526.zip` (396 entries). Keep G1/G2 OPEN; G2/05A-6 implementation is already present in baseline but local PASS evidence was not supplied. Validate that baseline before migrating this G3 overlay.

## Scope grounded in both frontend snapshots

Admin `components/admin/settings.tsx` / `lib/workspace-policy.ts` has preview store name, support email, HTTPS website URL, reporting timezone, order prefix and notice. Storefront `components/layout/footer.tsx` and `components/layout/logo.tsx` currently use static demo content. This increment implements only public identity/contact settings: **storeName, supportEmail, websiteUrl, timezone, supportNotice**. `orderPrefix` is explicitly deferred: an editable display field must not imply order ID-generation behavior. Logo/favicon/media, themes, SEO, domains/CORS, shipping/tax, service selection, policies, locale and feature flags also remain G3 follow-ups.

- `GET /v1/store/profile`: public safe configuration; returns `configured:false` and null identity instead of hardcoded Kookaburra when not set.
- `GET /v1/admin/store/profile`: OWNER bearer JWT only; returns the public projection plus `updatedAt`.
- `PUT /v1/admin/store/profile`: OWNER bearer JWT only; strict full DTO (no role/orderPrefix/mass assignment); stored transactionally with a no-PII audit event. Normalizes name and email, checks HTTPS website; no arbitrary browser redirect, CORS change, payment or order changes.
- Migration `20261030211000_phase05b1_store_profile_foundation`: new single-row `store_profiles` table with `key=primary` CHECK, no backfill or deletion. Each installation has its own database, not tenant IDs.
- Root app module and Swagger strict tag-order smoke test updated.
- Unit DTO/service tests, contract smoke, isolated PostgreSQL regression, RBAC/mass-assignment security, focused Swagger Chromium and full applicable suite wiring included.

## Frontend integration later (I-AD / I-SF)

Map the **five** approved editable fields to existing Admin preview form. Do not pretend `orderPrefix` changed live order numbers or that a Storefront API adapter was added. Storefront may use public profile for name/contact and link, escaping public text. On missing profile, present a deliberate unconfigured fallback (not leaked demo owner values). No frontend repository modified by this overlay.

## Required acceptance on owner's Windows machine

1. Confirm source is the 396-entry ZIP (or inspect changed file hashes) and verify the old 05A-6 migrations/source. Validate 05A-6 first; no automatic promotion from source presence.
2. Confirm development `kookaburra-api-dev` and test `kookaburra_api_test` are separate, LOCAL PostgreSQL databases; take **both fresh backups** before `db:deploy` or `test:api:db:deploy`.
3. Apply only the G3 overlay. Use `npm ci` with repository lockfile and required Node 24.x, then run `npm run db:generate`, `npm run db:validate`, dev `db:status`/`db:deploy`/`db:status`, guarded test DB deploy, `npm run check`, `npm run test:api:smoke`, `npm run test:api:db`, `npm run test:api:security`, `npm run test:api:visual:store-profile`, `npm run test:api:visual:all`, and alignment audit/test with both frontend paths. Record raw results, migrations, any failures/fixes and a new full Backend ZIP.
4. No DB/Chromium/Node24 full test suite ran in the patch creation environment (Node 22, no project dependencies or PostgreSQL). Syntax parsing and cross-repo source alignment are not local acceptance. Never label G3-1 PASS until the above are evidenced.

**Safety:** No previously applied Prisma migration changed. Never run `prisma migrate reset`, destructive `db push`, database-wide cleanup, or provider-dependent tests against live accounts. External TEST Stripe, SMTP and Firebase acceptance are not part of this patch.
