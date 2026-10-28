# Phase 04C-2B1 — Stripe Test Verified Settlement Foundation

Apply **ONLY** on top of `kookaburra-backend-full-20261028-092903.zip` (Phase 04C-2A validated baseline). Root-level overlay; no database reset.

The 04C-2A source/fixes were reviewed first; report supplied 198 test executions passed without 04C-2A source fixes. This patch includes the next conservative settlement foundation, not a payable release.

See `docs/PHASE04C2B1_VERIFIED_SETTLEMENT.md` for business rules, expiry race boundaries, operator-safe workflow and full validation commands. The old Stripe TEST preparation remains no-card-confirmation, no client-secret. New provider-retrieved `succeeded` receipts can be finalized atomically into PAID, stock mirrors and movements only through an explicit worker. Stale or mismatched events quarantine for manual review.

**Windows PowerShell** (after downloading archive to Downloads):

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04c2b1-verified-test-settlement-20261028.tar.gz" -C .
```

Run the acceptance suite from the documentation; the first migration status may report a pending migration. The authoring environment cannot run your Windows PostgreSQL and Chromium tests. Do not claim deployment or payment readiness on static checks alone. Use the user's local coding agent to fix any genuine failing test without weakening assertions, database safety or contract security.
