# Phase 02 — Auth security and negative test coverage (patch)

## Purpose

Add **independent, readable** Playwright test cases beyond the existing 16-step visible Swagger walkthrough. Test **real NestJS HTTP requests against real PostgreSQL**, including invalid credentials, token signature and expiry, disabled accounts, refresh replay and session persistence. It **does not** implement missing authentication security controls.

The existing `npm run test:api:visual:dev` keeps its current functionality and writes uniquely named inspection users to `kookaburra-api-dev`. **Do not use that development inspection mode for security mutation tests.**

## Commands (Windows PowerShell)

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
npm run check
npm run test:api:smoke

# Configure .env.api-test with ONLY a local kookaburra_api_test URL.
npm run test:api:db:deploy
npm run test:api:security
npm run test:api:db
npm run test:api:report

# Separate headed Swagger browser demo (writes to dev DB on explicit opt-in):
npm run test:api:visual:dev
```

`test:api:security` launches the API on **port 4101**, creates fresh uniquely marked accounts in **kookaburra_api_test**, then deletes only those accounts and their linked audit events. It has a strict DB preflight identical to the existing isolated integration suite. Do not put `.env`, `.env.api-test`, JWT values, test passwords or HTML traces in a public repository.

**Do not point API_TEST_DATABASE_URL at kookaburra-api-dev, Neon, Vercel, staging, production, or anyone else's database.** Script will reject unexpected name and non-local host, but local forwarded database tunnels still require operator care.

## Coverage added

### Database-backed, named security checks

1. Registration safe user response; no password hash disclosure.
2. Duplicate registration and DB count.
3. Rejection of role/status privilege injection.
4. Login with unknown email returns 401.
5. Wrong password returns 401.
6. Email normalization and case-insensitive duplicates.
7. Expired access token returns 401.
8. JWT wrong signing secret returns 401.
9. Wrong JWT issuer/audience/type return 401.
10. Malformed authorization and forged refresh token rejection.
11. Disabled user blocked from login/profile/refresh.
12. Expired refresh token rejected.
13. Refresh rotation + replay revokes active token family.
14. Logout revokes refresh token; no token returned.
15. Customer cannot impersonate admin.
16. STAFF admin access works, but disabled staff immediately loses access.
17. Successful customer login leaves correct audit event.

### No-DB smoke checks

- Missing registration fields; non-string credentials; overly long fields.
- Extra role field in login payload is forbidden.
- Refresh and logout reject bad token types and unknown body fields.

**Important limitations (not implemented or verified by this patch):** distributed rate limiting/brute-force mitigation, email verification, password reset, cookie/CSRF policy, account lockout, concurrent refresh-race stress, full permission-granular RBAC, secret rotation, DB outage fault injection, infrastructure-level security controls and any production payment flows. These are *release gates*, not passed tests. The use of an isolated test database is intentional: tampering with session expiry, account roles and disabling accounts should not affect demo/development records.

## Verification

No schema migration, new npm dependency, or frontend change is needed. Run test suite on the user's Windows Node 24/PostgreSQL environment. The packaged code has been statically reviewed and JavaScript syntax checked, but a real Prisma/PostgreSQL execution result is needed before marking the suite passed.
