# Kookaburra v2 — Storefront/Admin/Backend contract alignment (25 Oct 2026)

**Status: architecture/contract audit started; LIVE FRONTEND INTEGRATION NOT DONE.**
This phase makes integration gaps explicit _before_ introducing future backend modules. It deliberately makes no schema changes, UI changes, auth changes, catalog endpoint changes, or migrations. Never treat this audit as proof of runtime compatibility.

## Baselines reviewed

- Backend: `kookaburra-backend-full-20261025-194420.zip` + `phase03b-inventory` + `phase03b-typecheck-hotfix` + `phase03b-e2e-smoke-hotfix` (the user reports all local tests now pass)
- Admin: `kookaburra-admin-full-20261025-181323.zip`
- Storefront: `kookaburra-storefront-full-20261020-101939.zip`
- Blueprint: `Kookaburra_v2_Final_Architecture_Blueprint_2026-10-19.md`

## Main principle

Do **not** retrofit backend security, prices, stock or identifiers to browser-local demos. Keep canonical backend UUIDs, integer minor units, stock-ledger rules, immutable future order snapshots, provider-owned media IDs and backend RBAC. Adapt the two presentation layers through explicit versioned contracts. The backend should be reusable for client-specific frontends and Flutter.

## Field-level findings (verified from source)

| Area              | Current backend                                                     | Current Admin UI                                                       | Current Storefront                                          | Integration decision                                                                                                                  |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API prefix        | `/v1`                                                               | No live transport yet                                                  | `lib/api/client.ts` allows `/v1`                            | Keep `/v1`; no `/api` duplication                                                                                                     |
| Product identity  | UUID in PostgreSQL                                                  | `p-101`-style sample IDs                                               | `p-headphones`-style sample IDs                             | Never match by name/price; use canonical UUID plus reviewed migration map                                                             |
| Product name      | `title: string`                                                     | `name: string`                                                         | `title: {en:string}` in draft API; UI model `title: string` | Two explicit read projections/adapters; no silent field guesses                                                                       |
| Price             | `priceMinor`, optional `compareAtMinor`, currency code              | decimal `price`, `compareAt` in USD                                    | draft `ApiMoney {amountMinor,currency}`                     | Exact minor-unit adapter; variant price override must be retained                                                                     |
| Products page     | `{items,total,page,limit,pages}`                                    | local filter on whole array                                            | draft `ApiPage` wants `pageSize`                            | Map `limit -> pageSize`; paginate/filter server-side; test metadata                                                                   |
| Categories        | `categoryIds[]` on writes, nested parentId, relation on reads       | single `categoryId`, nested parent UI                                  | flat category fixtures, draft parentId                      | Preserve multi-category backend; choose explicit primary in Admin adapter                                                             |
| Variants          | `options` JSON with size/color, per-variant SKU/price/stock         | `{size,color,stock}`                                                   | `{options:{size?,color?},stock}`                            | Map to correct variant ID; preserve color-only and size-only support                                                                  |
| Inventory         | `InventoryBalance.id`, delta/reason/request UUID, per-SKU threshold | `adjustStock(productId, delta,note, variantId)`; low stock `<10`       | local display stock/availability                            | Resolve balance ID; generate idempotency UUID; update from authoritative balance; use threshold                                       |
| Product lifecycle | `DRAFT / ACTIVE / ARCHIVED`                                         | `Active / Draft` only                                                  | only active public products                                 | Add explicit archived UI handling in integration adapter; NEVER silently treat archived as draft                                      |
| Media             | No media asset model/API yet                                        | image `{id,url,alt}` field                                             | product gallery images and alt text                         | Define provider IDs, media references, ordering, alt text, safe deletion in Phase 03C                                                 |
| Authentication    | Returns access/refresh tokens, protects with bearer JWT             | preview-only staff roles/permissions, no live sign-in                  | `apiRequest` sends `credentials: include`, no bearer header | **P0 design decision**: secure HttpOnly cookie/BFF flow, CSRF/origin controls, token rotation/storage; do not use localStorage tokens |
| Staff roles       | `CUSTOMER/STAFF/ADMIN/OWNER` coarse permission                      | Owner, Manager, Catalog Editor, Support, Analyst and permission matrix | customer login preview                                      | **P0 design decision**: persistent backend role/permission mapping with migration plan                                                |
| Cart/orders       | Not implemented                                                     | orders & refunds local only                                            | local cart + quote DTO draft                                | Phase 04 contract driven by both UIs; backend prices and order snapshots win                                                          |
| Merchandising     | Not implemented                                                     | promotions, content, shipping, settings previews                       | homepage content draft                                      | Plan publishing visibility, links, features and country-aware rules before implementation                                             |

## Critical compatibility decisions to lock **before** integration

1. **Browser sessions (P0)**: choose a secure server-controlled HttpOnly-cookie/BFF design for both frontends, or a documented alternative with equivalent safety. Current bearer-only backend **does not** satisfy storefront cookie transport; this is not an adapter-only mismatch. Keep Swagger bearer capability for technical verification while adding browser-safe sessions.
2. **Staff permission model (P0)**: map the Admin role/permission matrix to persistent backend permissions and enforce on API, not just UI. Do not flatten Catalog Editor/Support/Analyst into broad ADMIN powers. Route permissions must be documented and tested.
3. **Presentation contract (P0/P1)**: either publish explicit `StorefrontProductDto`, `AdminProductDto`, `CategoryDto`, `InventoryDto` responses (preferred for API stability), or version tested client adapters. Decide final response schema _before_ binding UI data.
4. **Canonical identities (P0)**: no demo fixture IDs sent to production endpoint. For imported demo catalog, require a reviewed table of old ID -> new UUID and variant identity; do not guess absent variants.
5. **Product status and inventory semantics (P0)**: archived products must be explicit. Editing stock through Catalog PATCH remains forbidden after creation; Admin stock editing must use Inventory adjustment with UUID idempotency key.
6. **Media gallery (Phase 03C)**: implement product/category asset references, alt text, ordering/cover, public URLs, ownership, safe replacement and storage deletion in the same architecture pass. Avoid a one-image-only schema that later requires redesign.
7. **Commerce APIs (Phase 04)**: quote, shipping, coupon, order, payment and refund DTOs must be validated against _both_ UIs before coding. Do not accept client totals or client payment success flags.

## Deliverables and gates

| Gate                                      | Implementation result required                                                   | Validation                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A0: source inventory                      | Explicit cross-repo findings and assumptions                                     | `npm run alignment:audit` (source inspection; does NOT test HTTP)                              |
| A1: P0 decisions                          | Auth/session, permission model, primary product DTO, archive semantics finalized | `npm run alignment:gate` must have no open P0 findings; currently **expected to fail**         |
| A2: catalog + inventory DTO compatibility | All current product/category/variant/stock UI actions mapped; no lossy data      | Unit + OpenAPI contract + DB + security + Swagger visual:all + relevant frontend adapter tests |
| A3: media/content contract                | Product galleries/images/marketing editor contract complete                      | Media lifecycle tests, gallery read/write contract tests                                       |
| A4: commerce contract                     | Cart quotes, fulfillment, payment and order snapshots defined                    | Checkout/order contract and E2E suites on both frontends                                       |
| A5: frontend integration                  | All pages use real API consistently, previews isolated                           | Admin and Storefront full E2E, auth session tests, recovery tests                              |

## Running the audit (from backend folder)

Ensure repos sit alongside each other as `kookaburra-backend`, `kookaburra-admin`, `kookaburra-storefront`, or set `KOOKABURRA_ADMIN_DIR` / `KOOKABURRA_STOREFRONT_DIR` to point to their real locations.

```powershell
npm run alignment:audit
npm run alignment:test
# Expected to report remaining P0 blockers (exit code 2), not a code regression:
npm run alignment:gate
```

This new audit has no database access and never writes to a frontend, database or media store. It is a **source-level regression gate**, not a substitute for Playwright HTTP/Swagger browser tests or real integration.

## Future backend patch rule

Before each backend phase, inspect relevant frontend component + draft types, record exact request/response mapping, revise contract and corresponding tests, and only then implement endpoint/migration. Preserve `npm run check`, `test:api:db`, `test:api:security` and `test:api:visual:all`. Do not introduce fake frontend demo prices, IDs or stock as server truth. Track API incompatibilities openly instead of declaring integration ready.
