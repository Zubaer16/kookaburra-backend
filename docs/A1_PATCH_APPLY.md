# A1 Backend Alignment Patch — Apply and Verify

Baseline: `kookaburra-backend-full-20261025-220353.zip`. Apply to current Kookaburra Backend folder, not Storefront/Admin. No unrelated source or `.env` included.

PowerShell (after downloading to Downloads):

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-alignment-a1-jwt-rbac-20261025.tar.gz" -C .
npm run check
```

Back up `kookaburra-api-dev` and verify `DATABASE_URL` points only to local development PostgreSQL before running:

```powershell
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

`alignment:gate` can still report frontend-adapter and future-module gaps; live frontend integration is NOT yet implemented. No DB reset required. Test runner checks `kookaburra_api_test` and local host before executing real DB tests.

For details and known limitations see `docs/A1_JWT_PERSISTENT_RBAC.md`.

**Verification performed in authoring container:** TypeScript parser syntax, JS syntax, `alignment:audit` with all 3 codebases, audit unit tests, and archive integrity. Full Prisma generate/typecheck, lint, NestJS E2E, PostgreSQL, Chromium **NOT** run due missing Node 24/dependency cache and local DB/browser.
