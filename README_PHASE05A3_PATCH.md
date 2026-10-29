# KOOKABURRA G2 / Phase 05A-3 — Admin Customer Directory overlay

Apply ONLY on `kookaburra-backend-full-20261029-135516.zip` or the corresponding locally updated source. Do not reset a database; no new migration in this patch. Ensure dev/test DB identity and backups are correct before DB commands.

PowerShell in Backend repository root:

```powershell
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A3_ADMIN_CUSTOMERS_OVERLAY.tar.gz" -C .

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

npm run test:api:visual:customers
npm run test:api:visual:account
npm run test:api:visual:wishlist
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

Status: SOURCE PREPARED / LOCAL ACCEPTANCE PENDING (the above suites have NOT been rerun against the owner's PostgreSQL/Chromium environment). After validation provide complete results and updated full Backend ZIP. Do not disable existing tests.
