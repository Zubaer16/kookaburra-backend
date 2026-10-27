# Kookaburra v2 — Phase 04A-1 API Smoke Tag-Order Hotfix

## Root cause

The Phase 04A-1 Cart module introduced the `Cart / Customer` OpenAPI tag between `Media / Disk` and `Workspace / Admin`. The no-database Playwright API smoke test still expected the previous tag list.

## Change

Only `api-tests/system.smoke.spec.ts` is changed to expect the new tag. All existing endpoint checks and other assertions remain intact. No production API, database schema or migration changes.

## Apply (PowerShell)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04a1-api-smoke-tag-hotfix-20261027.tar.gz" -C .
```

## Verify

```powershell
npm run test:api:smoke
npm run check
```
