# Kookaburra v2 — Alignment A2 Patch

Baseline: `kookaburra-backend-full-20261025-233449.zip` (latest user-provided fully tested baseline).

**Adds:** non-destructive catalog merchandising/category fields, shop filters, frontend-friendly additive read aliases, Inventory lookup by product/variant identifiers, Swagger response and query documentation, tests in all three DB-backed layers.

## Apply to the existing backend folder (Windows PowerShell)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-alignment-a2-catalog-inventory-20261025.tar.gz" -C .
```

**Before applying migration:** Back up the local development database; verify `.env`/Prisma target is `kookaburra-api-dev` and is NOT a Neon production endpoint.

```powershell
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
```

Then run the full suite:

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

The test runner enforces the local isolated DB `kookaburra_api_test`. Browser and DB tests require local PostgreSQL, Node 24 and Chromium, and are **not confirmed passing** until executed on the user's Windows system. `alignment:gate` is expected to keep flagging remaining P0 frontend adapters; this patch is backend contract alignment, NOT live frontend integration.

## Safeguards

- No database reset or destructive SQL. No direct post-creation stock edits via Catalog.
- No JWT or role policy changes. Existing /v1 endpoint paths retained.
- Money remains integer minor units; no acceptance of UI decimal price authority.
- No Storefront/Admin files changed. Future frontend integration requires adapters and deliberate handling of demo fixture IDs.
- Media/gallery remains Phase 03C; cart/checkout/orders Phase 04 onward.

See `docs/A2_FRONTEND_ADMIN_CONTRACT_ALIGNMENT.md` for field mapping and contract guarantees.
