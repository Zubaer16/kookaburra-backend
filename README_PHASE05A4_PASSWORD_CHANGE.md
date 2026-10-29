# KOOKABURRA G2 / 05A-4 — Customer Password Change and Session Fencing

**Base:** `kookaburra-backend-full-20261029-142144.zip` (374 ZIP entries), includes G2-3 Admin Customer Directory. **Delivery:** additive root `.tar.gz` overlay. **Status:** SOURCE PREPARED / LOCAL ACCEPTANCE PENDING.

## Contract

`POST /v1/auth/change-password` (Customer Bearer JWT, HTTP 200):

```json
{ "currentPassword": "[current secret]", "newPassword": "[new secret]" }
```

Success: `{"changed":true,"sessionsRevoked":true}`. Current password must be correct; both passwords use existing 12–128-character registration limits. Reusing the same password is rejected. A staff token is not allowed. The endpoint never returns password material.

Under a conditional DB write, the backend changes `users.password_hash`, increments `users.session_version`, revokes all outstanding refresh-token sessions and writes a PII-safe audit event within one transaction. The `sv` claim on new access JWTs and the stored refresh session epoch must match `users.session_version`. A raced pre-change refresh cannot mint a new-epoch JWT. Existing JWTs issued before the patch have implicit epoch 0 and work until their original expiry if no password change occurs. After change, **ALL** earlier access and refresh JWT credentials fail and the customer must log in again. Out-of-band emails/password reset links are **not** part of this patch.

## Migration

`prisma/migrations/20261029151000_phase05a4_password_session_epoch/migration.sql` only adds `users.session_version INTEGER NOT NULL DEFAULT 0` and `auth_sessions.session_version INTEGER NOT NULL DEFAULT 0`; old tables, orders, migrations, refunds, tokens, payment records are not reset. Back up development **and** test databases and verify their IDs before applying migrations. Do NOT use `migrate reset`.

## Apply (PowerShell, from backend project root)

```powershell
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A4_PASSWORD_CHANGE_OVERLAY.tar.gz" -C .
```

## Validation (run in order)

```powershell
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

npm run test:api:visual:password-change
npm run test:api:visual:customers
npm run test:api:visual:account
npm run test:api:visual:wishlist
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

DB/security tests cover the old/new password, session revocation, JWT version match, staff rejection, malformed DTOs, CAS race and audit. Browser test uses Swagger UI Try it out -> Execute. No real Windows PostgreSQL/Chromium or npm build was executed in the patch-authoring environment. **Do not mark PASS without local evidence**. Send test logs, actual fixes and full latest Backend ZIP after acceptance.

## Unfinished gates

G2 email verification, forgotten-password reset and G7 actual email delivery remain open. Browser token storage/refresh UI is an integration concern. G1 cross-SKU, financial recovery, partial shipping and public tracking policy remain open. Storefront/Admin are not connected by this patch. Three owner-held master Markdown files remain outside all repositories; only 01 and 03 are replaced in this iteration.
