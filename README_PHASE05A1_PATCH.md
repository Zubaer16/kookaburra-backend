# Kookaburra V2 — G2 / Phase 05A-1 Wishlist overlay

Target: `kookaburra-backend-full-20261029-131221.zip` (post G1-4 source).

**MANDATORY**: Verify separate local `kookaburra-api-dev` and `kookaburra_api_test` DB identities and take two fresh nonempty verified backups **before extracting/applying migrations**. No `migrate reset`. Extract only at backend root. Do not overwrite client env or old migrations. Preserve old source in git.

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A1_WISHLIST_OVERLAY.tar.gz" -C .

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

npm run test:api:visual:wishlist
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

Stop on FAIL; keep raw logs and report actual fixes, do not weaken tests. Docs file is `docs/PHASE05A1_CUSTOMER_WISHLIST.md`. Master `.md` replacements remain owner-held outside all three repositories. G1 has unresolved scoped business decisions, so this new G2 work is **not** a G1 acceptance certificate.
