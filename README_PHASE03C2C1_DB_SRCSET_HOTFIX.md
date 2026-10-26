# Kookaburra Phase 03C-2C1 — DB responsive srcSet hotfix

## Confirmed cause

The shared CatalogService `productIncludes.media.include.media.select` omitted
`provider`. Prisma returned an image with a verified Cloudinary URL but no
provider key. `presentCatalogProduct` deliberately avoids responsive URLs
unless `provider === 'cloudinary'`, so `gallery[0].srcSet` was undefined.

## Scope

- `src/catalog/catalog.service.ts`: add `provider: true` to the nested media select.
  The shared include is used by public list/detail and admin product operations.
- `src/catalog/catalog.media-provider.spec.ts`: unit regressions for catalog
  query projections, real Cloudinary candidate URLs and no fabricated S3 srcSet.
- No endpoints, secrets, database schema/migrations, auth, storage cleanup,
  fixture assertions or existing tests removed/disabled.

## Apply from PowerShell

```
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2c1-db-srcset-provider-hotfix-20261026.tar.gz" -C .
```

## Verification

```
npm run check
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:test
```

No migration, DB reset, Cloudinary credentials or extra provider setup needed.
Full Node 24 / Jest / DB / browser suites must be verified on local Windows machine.
