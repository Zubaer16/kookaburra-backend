# Kookaburra backend — Phase 03C-2C1 incremental patch

Apply **only** to baseline `kookaburra-backend-full-20261026-155054.zip` (which already contains the Phase 03C-2B Windows errno hotfix).

```
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2c1-responsive-cdn-20261026.tar.gz" -C .
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

No Prisma migration. Do not reset either database. Tests run with the current provider configuration; Cloudflare remains optional and disabled unless BOTH `MEDIA_CDN_CF_ZONE_ID` and `MEDIA_CDN_CF_API_TOKEN` are set. Do not put real credentials in `.env.api-test` or commit them to Git.

Full feature/safety scope: `docs/PHASE03C2C_RESPONSIVE_CDN.md`.
