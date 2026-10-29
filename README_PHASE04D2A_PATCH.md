# Kookaburra Backend Phase 04D-2A root-level overlay

Baseline: `kookaburra-backend-full-20261028-162214.zip`.

Apply from repository root on Windows:

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\KB-04D2A-Returns.tar.gz" -C .
```

See `docs/PHASE04D2A_RETURNS_RESTOCK.md` for API, migration, safety boundaries and validation commands. No DB reset; backup and verify both local DB identities before applying migration. No Stripe calls are made from the return module. The customer order line response now additionally exposes `id`.

Static TypeScript syntax checks and archive verification were run; full Prisma typecheck/PostgreSQL/Chromium execution must be performed on Windows using the supplied test commands.
