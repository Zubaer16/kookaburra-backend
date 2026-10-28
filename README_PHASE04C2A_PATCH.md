# Phase 04C-2A Stripe Test Intent Preparation / Signed Webhook Receipts

**Baseline:** `kookaburra-backend-full-20261027-222020.zip` (includes the two accepted Phase 04C-1 fixes).

Apply the root-level `.tar.gz` archive over the existing repository. Do not remove or reset existing files. Back up BOTH local databases before the migration. A pending `db:status` result before deployment is expected.

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04c2a-stripe-test-preparation-20261027.tar.gz" -C .
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

The initial `STRIPE_TEST_ENABLED=false` means all tests use no real Stripe credentials. Real API tests use mock provider injection and guarded local `kookaburra_api_test`. DO NOT enable payment confirmation, charge, capture or refunds yet.

Full scope/safety details: `docs/PHASE04C2A_STRIPE_TEST_PREPARATION.md`.
