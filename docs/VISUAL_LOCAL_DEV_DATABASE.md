# Swagger Visual Walkthrough — LOCAL Development PostgreSQL

**Purpose:** Watch Swagger perform real HTTP requests against _your_ existing local `kookaburra-api-dev` database and then inspect newly created rows in pgAdmin. This differs from the disposable test database used by `test:api:visual:all`.

## Prerequisites

- Apply migrations to your existing **local development** DB first (`npm run db:status`). The command below does **not** run migrations or reset data.
- Your ignored `.env` must point both `DATABASE_URL` and, if defined, `DIRECT_URL` to **localhost** `kookaburra-api-dev`. Use a distinct long `JWT_ACCESS_SECRET`.
- Install Chromium once, if not already installed: `npx playwright install chromium`.

## Run

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
npm run test:api:visual:dev
```

The launcher reads `.env`, validates both the connection URL and the actual database identity, then starts a **separate local server at port 4102**. It refuses Neon, remote hosts, and any database name other than `kookaburra-api-dev`. Your normal port 4000 application remains separate.

**Writes new data:** A uniquely named `visual-dev-customer-...@example.test` account and `visual-dev-staff-...@example.test` account. Both rows are retained for you to inspect. The temporary STAFF account is disabled on normal test completion/failure and any sessions produced by the walkthrough are revoked; actual customer/admin accounts are not touched. If you forcibly kill the process while a temporary STAFF account is enabled, inspect the new `visual-dev-staff-` rows and **disable that temporary account** before continuing development.

No existing rows are deleted, and this visual walkthrough creates no products or orders (Phase 03A catalog endpoints now exist but are not exercised by this mode). Repeat runs create new inspection accounts. Never run this command with client/production data, and do not commit or publish Swagger reports/traces because request bodies and test tokens can appear inside them.

## Inspect the data

In pgAdmin open local database `kookaburra-api-dev` → Query Tool:

```sql
SELECT id, email, role, status, created_at
FROM users
WHERE email LIKE 'visual-dev-%@example.test'
ORDER BY created_at DESC
LIMIT 30;
```

```sql
SELECT u.email, s.created_at, s.revoked_at
FROM auth_sessions s
JOIN users u ON u.id = s.user_id
WHERE u.email LIKE 'visual-dev-%@example.test'
ORDER BY s.created_at DESC
LIMIT 30;
```

```sql
SELECT action, target_type, target_id, created_at
FROM audit_events
WHERE action IN ('customer.login', 'admin.login')
ORDER BY created_at DESC
LIMIT 30;
```

These queries show real saved rows, not mocked API responses. This mode is for **human observation**, not a replacement for non-destructive CI smoke tests or isolated database integration tests.
