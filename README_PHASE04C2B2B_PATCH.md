# Kookaburra Phase 04C-2B2B — TEST-only Confirmation/Capture

Apply at repository root on top of `kookaburra-backend-full-20261028-112940.zip`:

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04c2b2b-test-capture-20261028.tar.gz" -C .
```

Please read `docs/PHASE04C2B2B_TEST_AUTHORIZE_CAPTURE.md` before applying migrations or enabling payment configuration.

This is a root-level overlay (not a complete backend). The migration is additive and must only be applied after local database backup and target verification. TEST checkout remains disabled by default. This patch does **not** implement refund transactions or a customer card-entry UI. Run the full acceptance suite listed in the phase document with your local Node 24/PostgreSQL/Chromium environment. No DB reset.
