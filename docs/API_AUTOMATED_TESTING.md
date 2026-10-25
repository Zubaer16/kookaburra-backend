# Phase 02 — Automated HTTP API tests (Playwright)

The existing NestJS `npm run test` / `npm run test:e2e` remain in place.
This patch adds optional **Playwright API-only tests** without downloading a browser.

## A. Safe smoke tests (no database necessary)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
npm install
npm run test:api:smoke
npm run test:api:report
```

- The test runner boots a **separate server on 127.0.0.1:4101** and shuts it down.
- It explicitly **clears DATABASE_URL and DIRECT_URL** in smoke mode.
- Health, OpenAPI tag order, CORS, authentication schema validation, unauthorized access and unavailable routes are tested.
- It does **not** alter your normal local development database.
- Your normal `npm run dev` on port 4000 may remain running.

## B. Full Auth integration against a _separate test database_

These tests create and delete disposable customer/staff rows and sessions. **Never run against your development DB.**

1. Create a new, empty local PostgreSQL database named `kookaburra_api_test`. Do not reuse `kookaburra-api-dev`.
2. Copy `.env.api-test.example` to `.env.api-test` and set local PostgreSQL credentials. Leave normal `.env` unchanged. If your password contains reserved URL characters, percent-encode them.
3. Run the preflight-gated migration, then the DB tests:

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
Copy-Item .env.api-test.example .env.api-test
notepad .env.api-test
npm run test:api:db:deploy
npm run test:api:db
npm run test:api:report
```

The runner **refuses** any test DB URL whose host is not localhost/127.0.0.1/::1 or whose database name is not exactly `kookaburra_api_test`. It also refuses a test DB accidentally reused as normal DATABASE_URL/DIRECT_URL where those variables are present in the shell.

Do not commit `.env.api-test` or include secrets in a screenshot/log. The tester generates its own signing key for each isolated run.

## Tests included

| Test type      | Expected coverage                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe smoke     | Health/correlation, Swagger module tags/paths, 404, trusted/rejected origins, 400 DTO validation, 401 missing tokens                                     |
| DB integration | Customer register/login/profile, duplicate email 409, invalid password 401, admin role isolation, refresh rotation/replay 401, logout, staff admin login |

This phase checks the HTTP/API behavior. It **does not** automatically click the Swagger UI (the OpenAPI JSON is checked instead), and it does not claim to test future catalog/order/payment endpoints.

## HTML reports

Playwright writes `playwright-api-report/index.html` and `test-results-api/`. Both are gitignored. Failed API calls appear in the report; HTML screenshots are not available for API-only requests (browser UI is not used).

## Safety and repeatability

- Do not put `npm run test:api:db` in production CI without a disposable PostgreSQL service.
- The DB suite cleans up test users on completion, but failed runs may leave test-only records. Recreate the isolated test database if necessary.
- `npm run check` remains independent and does not require a database or Playwright integration test.
- `npm run test:api:db:deploy` applies existing migrations only to the validated **local test DB**; it never calls `migrate reset` or `db push`.
- An `npm audit` report and full production-auth review remain necessary before release.
