# Kookaburra v2 — Phase 04C-1 Orders Backend Overlay

Based on `kookaburra-backend-full-20261027-204718.zip`. See `docs/PHASE04C1_ORDERS.md` for invariants, API details, migration safety and acceptance commands.

Windows PowerShell (extract at repository root):

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04c1-order-intent-consumption-20261027.tar.gz" -C .
```

Only the changed root-relative files are included; no production secrets or full repo overwrite. Preserve current uncommitted changes by making a local Git backup/stash if needed. Back up the two local PostgreSQL databases before applying the additive SQL migration. Never run a database reset. Run acceptance suite locally on Node 24/Prisma 7.9.1.
