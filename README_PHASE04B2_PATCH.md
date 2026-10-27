# Phase 04B-2 — Time-limited Inventory Reservation & Expiry

Overlay for the supplied `kookaburra-backend-full-20261027-193743.zip`, **not** a replacement repository. Back up dev (`kookaburra-api-dev`) and isolated test (`kookaburra_api_test`) databases before migrations.

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04b2-reservation-expiry-20261027.tar.gz" -C .
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:reservation
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

Note: `db:status` reports pending Phase 04B-2 migration before `db:deploy`; verify target first. `npm run checkout:expire` is an actual database-mutating expiry command and needs a scheduled runner in production.

Detailed semantics, constraints and pending scope: `docs/PHASE04B2_RESERVATION_HOLDS.md`.
