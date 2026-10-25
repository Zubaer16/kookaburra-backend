# Alignment A1 — JWT-only Authentication + Persistent Staff Permissions

**Baselines:** Backend `20261025-220353`, Admin `20261025-181323`, Storefront `20261020-101939`.

## JWT and compatibility

- Keep bearer access JWT/opaque rotating refresh token, existing `/v1` routes and token structure.
- No new cookie session, browser BFF or hidden frontend authorization is created.
- Protected request resolution checks the PostgreSQL user status and current staff role permissions **on every call**, so old JWTs cannot retain revoked role grants.
- `GET /v1/admin/auth/me` adds `staffRole` and `permissions`; existing `id/email/role` remain.
- Storefront and Admin frontend transport must later attach `Authorization: Bearer <token>` and implement a reviewed safe token lifecycle. Do not use frontend preview permissions for access control. Avoid storing long-lived refresh tokens in localStorage.

## Admin roles

Keys: `OWNER`, `MANAGER`, `CATALOG_EDITOR`, `SUPPORT`, `ANALYST`.
Admin UI labels map to keys: Owner / Manager / Catalog Editor / Support / Analyst.
Permissions copy Admin `lib/workspace-policy.ts` (11 stable keys), with default grants persisted as rows.
Role editing: Owner cannot be edited; the initial `OWNER` can grant permissions to other roles. For A1, role policy and staff roster mutation require a coarse OWNER role, guarding against self-granted privilege escalation. The backend can evolve to delegated scoped staff management later **only** through a separate reviewed security rule.

Frontend mappings: `StaffMember.role` uses the display label returned as `name`; use `key` as the persisted identifier. UI `Active` maps to backend `ACTIVE`, and UI `Suspended` maps to backend `DISABLED`. Existing staff may have an empty display name until edited.

Legacy users: OWNER -> OWNER; ADMIN -> MANAGER; STAFF -> SUPPORT; CUSTOMER none. Migration backfills assignments. Any tests that update coarse `User.role` directly without an assignment continue to work using the matching default role. All new staff are assigned persisted workspace roles.

## API contract

- `GET /v1/admin/roles`: Owner-only; return `[{key,name,permissions,immutable}]`.
- `PATCH /v1/admin/roles/{key}/permissions`: Owner-only; replace grants atomically with an audit event. Body `{permissions:["catalog.manage",...]}`; 400 invalid key/payload, 403 owner role modification.
- `GET /v1/admin/staff`: Owner-only; excludes CUSTOMER, returns safe `{id,name,email,role,status,createdAt}`.
- `POST /v1/admin/staff`: Owner-only; body `{name,email,password,role}`; only non-OWNER roles allowed; 201 created or 409 duplicate email.
- `PATCH /v1/admin/staff/{id}`: Owner-only; body `{name?,role?,status?}`; OWNER modification prohibited.
- `GET /v1/admin/auth/me`: Additive `{staffRole,permissions}` from DB.

Catalog writes require `catalog.manage`; Inventory adjustments and threshold writes require `inventory.adjust`. Existing staff-read endpoints remain accessible to staff roles to preserve previously working behavior; permission-based read restrictions require a separate contract decision when their features are implemented. These are live permissions, not JWT claims.

## Migration/test safety

- Additive PostgreSQL migration `20261025223000_a1_persistent_rbac` adds role/permission/assignment tables and user display name.
- No resets. Backup `kookaburra-api-dev` before `npm run db:deploy`; always run `npm run test:api:db:deploy` for isolated `kookaburra_api_test` before DB/Swagger/Security tests.
- Run `npm run check`, `npm run test:api:smoke`, `npm run test:api:db`, `npm run test:api:security`, `npm run test:api:visual:smoke`, `npm run test:api:visual:all`.
- Tests cover positive and negative staff CRUD, live permission changes, rejected mass assignment, owner protection, DB persistence, Swagger UI Try it out -> Execute, OpenAPI schemas and regression.
- Runtime tests must be run on the user's Node 24 + local PostgreSQL + Playwright Chromium environment before declaring A1 verified.

## Important deferred API compatibility gaps

A2 Catalog/Inventory adapters and A3 Media still remain. A1 does not claim Storefront/Admin live integration or `alignment:gate` fully passing.
