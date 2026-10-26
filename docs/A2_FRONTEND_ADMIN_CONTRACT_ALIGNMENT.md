# Phase A2 — Catalog & Inventory Contract Alignment

**Source:** Backend `kookaburra-backend-full-20261025-233449.zip`; Admin `20261025-181323`; Storefront `20261020-101939`.

## Design decisions

- Keep existing `/v1` APIs, bearer JWT, Prisma UUID identities, SKU ledger, RBAC rules, response fields and inventory `balanceId` write path.
- Add Category `color`, `sortOrder`, `active` for current Admin category cards and Storefront navigation. Public `GET /v1/categories` returns only active categories; Admin lists all. Category visibility **does not unpublish a product**; product status still controls product visibility. Category color is a validated hex token, not arbitrary CSS.
- Add Product `badge` and `tag` (`new` / `popular` / `sale`), both optional; never infer sale tag from compare-at price.
- Public and Admin `GET /v1/products` share optional `tag`, `sort` (`newest`, `price-asc`, `price-desc`), `inStock` (`true`/`false`), `minPriceMinor`, `maxPriceMinor`. `category` remains the canonical slug. Price filters/sorting apply to the **base product price**; variant effective price appears in variant read projections. `newest` sorts by `createdAt` rather than a manually assigned tag. Min > max returns 400.
- Public/Admin catalog read responses preserve legacy raw fields and add `categoryIds`, `price: {amountMinor,currency}`, optional `compareAt`, `purchasable`, and on every variant `available` plus effective `price`. `purchasable` is only a display hint; **not** an authoritative checkout quote or reservation. English-only frontend localization `{en: ...}` remains a frontend adapter mapping (do not change `title` from string to object).
- Product pages and Inventory list/movement pages include `pageSize` in addition to legacy `limit` and `pages`.
- `GET /v1/admin/inventory?productId=<UUID>&variantId=<UUID>` resolves inventory balance for an Admin SKU using canonical identifiers; adjustment still requires balance UUID and idempotency `requestId`. Products with variants can expose a zero-stock simple-product balance in DB but it stays hidden from active inventory listing.
- No media URLs or image arrays fabricated now. Media/gallery joins, image ownership, upload and safe deletion are **Phase 03C**, not an A2 mock.

## Still adapters (not backend bugs)

- Admin: `name` ↔ backend `title`, `price` decimal USD ↔ `priceMinor` integer USD, `status` Active/Draft vs ACTIVE/DRAFT/ARCHIVED, categoryId from categoryIds, Inventory adjustment gets balance ID by query then sends requestId UUID and reason. Archive must not be silently converted to Draft.
- Storefront: backend English `title`/`description` strings ↔ `{en: string}`; `pageSize` alias now exists. Storefront price and SKU/stock are display-only until Phase 04 checkout.
- Demo local fixture IDs are not canonical UUIDs; a deliberate fixture-import strategy is required.

## Deployment/migrations

Back up `kookaburra-api-dev` then `npm run db:status` / `npm run db:deploy`. Apply isolated test DB migration with `npm run test:api:db:deploy`. This additive migration does not reset or alter existing order/customer/stock data.

## Mandatory tests on Windows

```powershell
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

The DB/security/Chromium suites use isolated `kookaburra_api_test`, not your development or production DB. These tests have been written but must be executed locally before acceptance.
