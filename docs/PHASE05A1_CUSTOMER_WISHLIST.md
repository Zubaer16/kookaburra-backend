# G2 / Phase 05A-1: customer persistent wishlist (2026-10-29)

Status: **SOURCE PREPARED / LOCAL ACCEPTANCE PENDING**. Target backend baseline: `kookaburra-backend-full-20261029-131221.zip`. This is an incremental G2 patch, not G2 acceptance or closure of G1. G1's unresolved cross-SKU/financial/partial-fulfillment and public-tracking policy decisions remain open in the owner-held roadmap.

## Implementation / contract

- `wishlist_items(user_id, product_id, created_at)` with composite uniqueness and cascading cleanup of parent rows. Additive migration `20261029140500_phase05a1_customer_wishlist`.
- `GET /v1/wishlist` returns `{ items: [{productId,slug,title,currency,priceMinor,addedAt}], count }`, published products only. An archived/draft bookmark remains stored but is hidden from customer output and does not become purchasable.
- `PUT /v1/wishlist/:productId` adds or safely retries a published product bookmark; 404 for missing/unpublished ID; 409 at 100 total stored items.
- `DELETE /v1/wishlist/:productId` returns `{ removed: boolean }` and is idempotent. No ability to modify another customer's row.
- `POST /v1/wishlist/merge` accepts `{ "productIds": ["UUID", ...] }`, 0–100 **distinct canonical backend UUIDs**. Atomic upsert after customer row lock; all IDs must refer to currently ACTIVE products, otherwise the entire request fails (404). Duplicate submitted IDs/extra fields rejected (400); repeats of the same valid merge do not add more rows. No guest token, no cart mutation.
- JWT Bearer + CustomerCartGuard; unrelated staff/admin accounts rejected. Server owns userId. No client amounts/stock/publication/roles are trusted.

## Storefront integration boundary

Current Storefront's `stores/commerce-store.ts` persists `wishlist: string[]` preview product IDs. Those **are not canonical DB UUIDs**. During I-SF implement an explicitly reviewed identifier map for genuine saved items or skip unresolvable IDs with a clear UI warning; do not infer matches by product title, SKU, price or position. Connect UI sorting/toggle/clear to the authenticated API and map minor units for display. No Storefront change is in this overlay.

## Acceptance

- Before migration: confirm dev DB and isolated test DB identities; take both backups. Do not reset/mutate earlier migrations.
- `npm run db:generate`, `db:validate`, `db:status`, `db:deploy`, `db:status`, `test:api:db:deploy`.
- `npm run check`, API smoke/DB/security, `test:api:visual:wishlist`, full Chromium, alignment audit/tests.
- DB suite exercises persistence, concurrency/merge dedupe, private ownership, archived hiding, idempotent remove; security tests exercise JWT, staff RBAC, mass-assignment and DTO rejection; Swagger smoke verifies exact route and schema security; Chromium executes real documented operations.
- Source syntax and archive inspection do **not** equal successful local PostgreSQL/Chromium acceptance. Owner to share local PASS/FAIL report and updated full Backend ZIP.

## Not in this increment

Email verification/password reset (to be linked to G7 email), profile/address management, Admin customer listing/summary, guest checkout decision, G1 unresolved recovery/cancellation/mixed-shipment policies. G2 remains **OPEN**.
