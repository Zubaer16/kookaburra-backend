# Phase 04A-1 — Swagger tag order E2E hotfix

Issue: `npm run check` failed in `test/health.e2e-spec.ts` on the exact OpenAPI tag order because Phase 04A-1 introduced `Cart / Customer`, but the expectation still used the previous list.

Fix: Adds `'Cart / Customer'` between `'Media / Disk'` and `'Workspace / Admin'` in the expected tag order. Does not suppress any assertion, skip any test, or alter the API/Swagger configuration.

## Apply on Windows PowerShell (repo root)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04a1-swagger-tags-e2e-hotfix-20261027.tar.gz" -C .
npm run test:e2e
npm run check
```

No Prisma migration, dependency, or database reset required. After `npm run check` passes, continue DB/security/Swagger suites for Phase 04A-1 acceptance.
