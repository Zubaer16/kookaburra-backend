# Phase 04A-1 — Customer cart / live DB quote

## Scope

- Customer JWT-only API: `GET /v1/cart`, `GET /v1/cart/quote`, `PUT /v1/cart/items`, `DELETE /v1/cart/items/:id`, `DELETE /v1/cart`.
- A cart belongs to exactly one CUSTOMER user, persists in PostgreSQL. No JWT cookie/session fallback and no client-supplied price, subtotal, currency or availability accepted.
- `PUT /v1/cart/items` sets an **absolute** quantity (1-99), not an increment. PostgreSQL row lock serializes same-cart writes; max 50 distinct lines. A separate partial unique index enforces only one simple-product line (because `NULL` variants do not compare equal under standard PG unique constraints).
- Variant must belong to the product. Product must be ACTIVE. Stock sourced from `inventory_balances`, never UI, never stale Catalog stock mirrors. Quote uses a consistent RepeatableRead DB snapshot; prices are integer minor units. Cross-currency item addition is rejected.
- Quote re-evaluates product/variant availability, stock and price. Invalidation marks `issues` and `checkoutReady=false`, never silently drops or auto-purchases unavailable lines. `amountDueMinor` **always null** until shipping/tax/discounts are server-calculated by future Phase 04 milestones.
- Cart is **not** a stock reservation. Adding to cart never decrements stock. No order, payment, tax, shipping, coupons or inventory holds implemented here.
- Guest cart ownership and secure merge are deferred to Phase 04A-2. No anonymous write endpoints in this patch. Frontend integration is deferred; backend route contract is UI-independent.

## Deployment and acceptance

1. Back up LOCAL `kookaburra-api-dev`, check `.env` database credentials, apply additive Prisma migrations (`npm run db:deploy`).
2. Test DB migrations: `npm run test:api:db:deploy`, guarded against accidental development DB use.
3. `npm run check`, `npm run test:api:smoke`, `npm run test:api:db`, `npm run test:api:security`, `npm run test:api:visual:smoke`, `npm run test:api:visual:all`, `npm run alignment:audit`, `npm run alignment:test`.
4. Real PostgreSQL tests verify cart persistence, tampered prices, account isolation, stock changes, publication changes, variant pricing and JWT authorization. Swagger UI Chromium performs real Try it out requests, not mocked UI clicks.
5. No full suite was executed in this patch-authoring environment; acceptance requires the above local tests to pass.
