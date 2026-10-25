# Visual Swagger API Tests — Kookaburra v2 Phase 02

This patch **supersedes** `kookaburra-api-swagger-ui-headed-playwright-20261020.tar.gz`. Do not apply the old visual patch.

## What you see

A headed Chromium browser opens a real Swagger UI and automatically performs **Try it out → Execute**. It validates actual HTTP responses and Swagger's rendered status. Tests pause between steps, and the terminal also prints endpoint/status logs.

Current implemented API inventory (**8 endpoints**):

1. `GET /v1/health`
2. `POST /v1/auth/register`
3. `POST /v1/auth/login`
4. `POST /v1/auth/refresh`
5. `POST /v1/auth/logout`
6. `GET /v1/auth/me`
7. `POST /v1/admin/auth/login`
8. `GET /v1/admin/auth/me`

Future Catalog/Orders/Payments endpoints **are not yet implemented**, so visual tests cannot execute them now.

## Quick visual smoke — does not need PostgreSQL

1. In `kookaburra-backend`: `npm run check` (resolve any unrelated failures first).
2. Install browser once: `npx playwright install chromium`.
3. `npm run test:api:visual:smoke`.

This starts a fresh test server on **port 4101**, not your normal dev API on 4000. It does **not** attach a database. It demonstrates health 200, unauthorized customer/admin 401, and invalid registration 400.

## Full visual API suite — local test database required

**IMPORTANT:** `visual:all` is intentionally blocked without a separate, freshly migrated local PostgreSQL database named exactly `kookaburra_api_test`. **Never use `kookaburra-api-dev`, Neon or client data**. The only credentials used by the suite belong to random temporary test accounts, not your OWNER account.

1. Create database `kookaburra_api_test` in your local PostgreSQL (using pgAdmin or `createdb`).
2. Copy `.env.api-test.example` to `.env.api-test`, then edit `API_TEST_DATABASE_URL` to use **that separate test database**. Do not paste secrets into chat and do not change your regular `.env`.
3. `npm run test:api:db:deploy` (migration is guarded to require local `kookaburra_api_test`).
4. Install Chromium once with `npx playwright install chromium`.
5. `npm run test:api:visual:all`.
6. `npm run test:api:visual:report` for an HTML Playwright report.

The test server runs automatically on **4101**; don't manually start it. Port 4101 must be free. It covers all 8 currently documented endpoints, including real customer registration/login/refresh/logout, authorized customer profile, temporary staff login and authorized admin profile. Temporary users are deleted on normal test completion or handled test failures; unexpected process termination can leave test-only rows in the isolated database.

**Server logs**: for a _separate_ human-visible server terminal, use `npm run dev` on port 4000 and Swagger there for manual clicks. Automated visual tests launch their own 4101 server, so the HTTP requests appear in the Playwright/test-process terminal, not the unrelated 4000 dev terminal.

**Safety and limitations:** One random customer and one random temporary STAFF account may be created. The suite never changes your real OWNER credentials, never invokes an existing user, and never writes test data to the development database. Test tokens/passwords appear transiently inside your local Swagger browser as part of the demonstration; don't screen-share or save traces publicly. On test failure, screenshots and traces are kept locally. Network/install/run validation still needs to occur on your Windows computer.
