# Kookaburra Phase 04B-1 — Checkout Estimate & Configurable Country Shipping/Tax

Overlay patch for baseline `kookaburra-backend-full-20261027-184821.zip` only. This adds new source/test/docs and an additive Prisma migration. It does **not** reserve inventory, create orders or authorize charges.

Windows PowerShell in backend root:

```powershell
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04b1-checkout-estimate-country-rates-20261027.tar.gz" -C .
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:checkout
npm run test:api:visual:all
npm run alignment:test
```

Back up both the local development and test DBs before `db:deploy`. Verify `.env` targets the development DB (`kookaburra-api-dev`); `db:deploy` does not use the isolated `.env.api-test`. The **test** DB migration command (`test:api:db:deploy`) uses the guarded `kookaburra_api_test` URL only.

Full API examples, caveats and next 04B-2 scope: `docs/PHASE04B1_CHECKOUT_ESTIMATE.md`.
