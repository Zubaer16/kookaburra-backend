# Phase 05A-3 — Admin Customer Directory (source prepared; acceptance pending)

- Latest baseline: `kookaburra-backend-full-20261029-135516.zip` (after G2 05A-2 owner-reported PASS).
- `GET /v1/admin/customers?page=1&limit=20&search=...&status=ACTIVE|DISABLED` returns paginated customer-only rows; stable createdAt/UUID descending order; max 50 rows per page.
- `GET /v1/admin/customers/:id` returns read-only account summary, address **count** and five recent order IDs/statuses, never addresses/payment details/financial totals.
- Both require JWT and server-side persisted `customers.view` permission (OWNER always allowed). Demotions/role changes apply immediately through AccessGuard permission resolution. No customer mutations, no export, no new DB schema or migration.
- Search is case insensitive over customer email/displayName. No staff accounts leak through either endpoint.
- This is a source-level incremental patch; full test/build/DB/Chromium execution is required locally.
- Scope still pending in G2: verified email/password recovery and guest-checkout boundary. G1 remains OPEN for cross-SKU financial exchange and paid cancellation policies.
- Integration handoff: Admin customers table requires an API adapter replacing preview fixtures. Do not use local fixture IDs as production UUIDs. More detailed reports remain G9 scope.
