# KOOKABURRA V2 — G2 / Phase 05A-2: Customer Profile + Saved Address Book

**Baseline:** `kookaburra-backend-full-20261029-133445.zip` (post G2/05A-1 owner-reported PASS). **Status:** SOURCE PREPARED / LOCAL ACCEPTANCE PENDING. This is a root-level incremental `.tar.gz` backend overlay, not a whole repo.

## Design and API

- `GET /v1/account/profile` — live private CUSTOMER profile from `users`.
- `PATCH /v1/account/profile` — display name only (`{ "displayName": "Example" }`). Email change, verified identity and password reset are deferred to G2/G7; no implicit verification.
- `GET /v1/account/addresses`; `GET /v1/account/addresses/:addressId`.
- `POST /v1/account/addresses`, `PATCH /v1/account/addresses/:addressId`, `DELETE /v1/account/addresses/:addressId`.
- Required address input: `recipientName`, E.164 `phone`, `addressLine1`, `city`, ISO alpha-2 uppercase `countryCode`. Optional: `label`, `addressLine2`, `region`, `postalCode`, `isDefault`. Unknown properties rejected. The first address becomes default, another can be selected with `isDefault: true`, and deleting the default promotes the oldest remaining address. An address cannot be explicitly unset as default until another is selected.
- Customer-only Bearer JWT; no user/owner ID accepted from client; a different customer's address looks like 404. Audit events contain IDs/action only, no address details. Limit 10 saved addresses per customer; user-row lock serializes all writes and a partial unique SQL index protects the single-default invariant.
- Address book is NOT a shipping/tax eligibility policy and does NOT mutate historical orders. Selecting a saved address for a new checkout remains a Storefront integration task; checkout/orders continue to validate the submitted snapshot.

## Schema/migration

- Add `CustomerAddress` relation to `User` and additive `customer_addresses` table.
- **New migration:** `20261029143000_phase05a2_customer_profile_addresses`; does not modify existing `users` or `orders` table records.
- Existing `display_name` column is reused (no profile-specific column addition).
- PostgreSQL partial unique index `customer_addresses_one_default_per_user` is migration-managed, intentionally SQL-level. Do not rewrite historic migrations.

## Windows PowerShell (from backend repository root)

BEFORE APPLYING: confirm dev/test DB identity; take fresh `pg_dump -Fc` backups of `kookaburra-api-dev` and `kookaburra_api_test`, verify nonempty backup files. Preserve any uncommitted changes before overlay extraction. Do NOT run `prisma migrate reset`.

```powershell
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A2_ACCOUNT_OVERLAY.tar.gz" -C .

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

npm run test:api:visual:account
npm run test:api:visual:wishlist
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

`alignment:audit` must be executed with both Frontend code paths configured; a source audit does not prove live integration. Save command outputs, any actual fixes, and return updated full Backend ZIP. Do not suppress failing tests. Do not declare G2 accepted yet.

## Test inventory

- `src/account/account.dto.spec.ts`: DTO boundary unit tests.
- `api-tests/account.contract.smoke.spec.ts`: OpenAPI paths, typed response and JWT security.
- `api-tests/account.db.spec.ts`: live PostgreSQL profile, addresses, default transfer, 10-item concurrent cap, audit, multi-user isolation.
- `api-tests/account.security.spec.ts`: no bearer, staff role, IDOR, invalid payloads/mass assignment/UUID.
- `swagger-ui-tests/account.db.spec.ts`: Chromium Swagger Try it out -> Execute.
- Updated strict Swagger tag list, package command and `scripts/run-api-tests.cjs` routing.

**Preparation evidence:** Baseline ZIP CRC integrity checked; changed TypeScript grammar parsed successfully; npm dependencies were not installed successfully in this sandbox (timeout). Prisma generate/deploy, full typecheck/lint/Jest, PostgreSQL/Chromium were NOT executed here. Owner-reported G2-1 PASS has not been independently rerun.

## Remaining G2 / G1

G2 still needs email verification/password reset + G7 email delivery, account/guest policy, Admin customer search and secure browser auth adapter. G1 financial cross-SKU exchange, paid cancellation, partial fulfillment and public tracking policy remain OPEN. Keep prior completed code/migrations; this patch does not revise those choices.
