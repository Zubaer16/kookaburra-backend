# Phase 03C-2B Windows/Jest filesystem error hotfix

Baseline: Phase 03C-2B VPS disk storage patch, applied to your `kookaburra-backend` repo.

## Problem

`npm run check` failed in `src/media/disk.storage.spec.ts` because on Windows/Jest, the filesystem `EEXIST` error from an atomic hard-link was not always recognized by the condition `error instanceof Error`. The raw filesystem error escaped rather than the intended NestJS `409 ConflictException`.

## Changes

- `src/media/disk.storage.ts`: check `code` structurally for `EEXIST`/`ENOENT` without requiring `instanceof Error` across VM realms. Applies to receive, verify, getStream, and idempotent delete. Atomic hard-link (no overwrite) and namespace restrictions preserved.
- `src/media/disk.storage.spec.ts`: assert duplicate uploads throw a NestJS `ConflictException`; add an explicit missing-file `NotFoundException` assertion for `getStream`.

No Prisma/schema/API contract changes. No migration or reset.

## Apply on Windows PowerShell

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2b-windows-fs-errno-hotfix-20261026.tar.gz" -C .
npm run check
```

After check passes, continue:

```powershell
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:test
```

## Verification in patch-generation environment

Archive validation, TypeScript syntax/transpilation, and a focused simulated runtime test with cross-realm `EEXIST`/`ENOENT` passed. The full project's Node 24, Jest/NestJS, PostgreSQL, and Chromium suites require verification in your Windows environment.
