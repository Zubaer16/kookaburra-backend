# Kookaburra v2 — Phase 04C-2B2C2 Overlay

Based on `kookaburra-backend-full-20261028-133557.zip`.

## Apply (Windows PowerShell)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04c2b2c2-stripe-refunds-20261028.tar.gz" -C .
```

## Acceptance sequence

**Back up local development and isolated test PostgreSQL databases first.** Check that each migration target is correct; do not reset either database.

```powershell
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run db:status
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:payments
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

New migration: `20261028194500_phase04c2b2c2_refund_execution` (adds processing/confirmation tracking columns to existing refund ledger; no destructive operations). First `db:status` may report the expected pending migration.

Operator-only `npm run payments:refunds` is **mutating** and deliberately disabled by default (`STRIPE_TEST_REFUNDS_ENABLED=false`). Never run until approved Stripe TEST keys, correct database and pending refund requests are reviewed. Real Stripe TEST API execution was **not** performed in patch-building environment. See `docs/PHASE04C2B2C2_STRIPE_TEST_REFUND_EXECUTION.md`.
