# Kookaburra Backend Phase 04A-1 — Cart TypeScript Hotfix

Applies on top of `kookaburra-backend-phase04a1-customer-cart-live-quote-20261027.tar.gz`.

## Changes

- `src/cart/cart.service.ts`: Replace deeply readonly `as const` on Prisma cart relation include with `satisfies Prisma.CartInclude` to permit Prisma's mutable `orderBy` array while retaining literal selections and accurate query result inference.
- `src/cart/cart.quote.spec.ts`: Assert each quote item's expected status using `toMatchObject` rather than dereferencing potentially missing array entries. The checks still fail if an expected item is missing.

No endpoint, Prisma schema/migration, authorization, price/stock calculation, or security behavior changes. No database migration required.

## PowerShell apply

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase04a1-cart-typecheck-hotfix-20261027.tar.gz" -C .
npm run check
```

After `check` passes:

```powershell
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:test
```

This patch has been reviewed statically, but complete Jest/Prisma/NestJS compilation and PostgreSQL/Chromium runs still require the user's Windows environment.
