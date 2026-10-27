# Phase 04A-2 — Anonymous cart & secure customer merge

## Contract and UI alignment

- Customer cart remains unchanged: `GET /v1/cart`, `GET /v1/cart/quote`, `PUT /v1/cart/items`, `DELETE /v1/cart/items/:id`, `DELETE /v1/cart`.
- Anonymous Storefront must explicitly call `POST /v1/guest-cart` and store the returned one-time opaque `guestToken` securely on that browser. The current demo/local cart **has not been connected** to these endpoints.
- Guest operations: `GET /v1/guest-cart`, `GET /v1/guest-cart/quote`, `PUT /v1/guest-cart/items`, `DELETE /v1/guest-cart/items/:id`, `DELETE /v1/guest-cart/items` (clear), and `DELETE /v1/guest-cart` (revoke). Supply `X-Guest-Cart-Token` for each, never place the token in URLs.
- After JWT customer login or registration, call `POST /v1/cart/merge` with `{ "guestToken": "..." }` and `Authorization: Bearer <JWT>`. Retry for the **same** customer is idempotent. A consumed guest token cannot be used to read the customer cart and cannot merge into another account.
- This capability is **not** a customer/admin authentication token; the JWT-only identity and RBAC rules remain enforced. Guest cart token hash is persisted; the plaintext token is never saved in DB.
- Guest capabilities expire after 14 days. Call `DELETE /v1/guest-cart` to revoke early; expired rows must be pruned by operations in a later phase. Anonymous cart creation should be protected by application/gateway rate limits in deployment to prevent abuse.

## Swagger UI authorization (Phase 04A-2 visual-test repair)

Guest capability is documented as the **`guest-cart-token` OpenAPI apiKey security scheme** in the `X-Guest-Cart-Token` header, not as a required Swagger parameter row. Use **Authorize** in `/docs`, select **guest-cart-token**, and enter the opaque capability (no `Bearer` prefix). This avoids Swagger form validation preventing a documented request from reaching the API. The `POST /v1/guest-cart` creation route remains public, but the other guest routes require that scheme. Customer/admin routes continue to use the independent `access-token` JWT Bearer scheme. Both continue to transmit the same headers and enforce the same access rules; only OpenAPI presentation changes. Do not share or log real guest tokens.

## Merge semantics

- Absolute `PUT` quantity for guest items is idempotent; `merge` adds guest quantity to existing matching product+variant lines **once**, without trusting any client price/stock/currency.
- **All-or-nothing transaction** locks the guest record and customer cart, rechecks current product status, variant ownership, inventory balance, quantity 1..99, currency consistency and 50-line maximum. Invalid lines yield 409 and leave BOTH carts unchanged for remediation.
- A guest token is single-owner, single-consumption. Concurrent double merges serialize on guest row and do not increase quantity a second time.
- Quote uses current PostgreSQL price and stock. No reservation, shipping, tax, payment or due total. Checkout will revalidate later.
- `guestToken` MUST be treated like a password by clients: avoid analytics, logs, querystrings and accidentally sharing it across users/devices. Client should discard it after successful merge. Browser storage is XSS-sensitive; apply strict CSP and avoid exposing token to third-party scripts.

## Deployment/testing

1. Apply this overlay from repository root (do not delete existing files).
2. Back up local `kookaburra-api-dev` first, then `npm run db:deploy`.
3. Apply to guarded **local-only** `kookaburra_api_test` using `npm run test:api:db:deploy`.
4. Run `npm run check`, `npm run test:api:smoke`, `npm run test:api:db`, `npm run test:api:security`, `npm run test:api:visual:smoke`, `npm run test:api:visual:all`, `npm run alignment:audit`, `npm run alignment:test`.

Automated tests use isolated PostgreSQL, no production DB, no reset. These tests do not guarantee an end-to-end connected Storefront until Phase 06.
