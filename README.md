# Kookaburra Backend — Phase 02 (persistence + identity)

Independent, single-store NestJS backend. **Kookaburra is only the author's demo/project name.** Each client deploys its own store, database, credentials, domain and hosting. Existing Next.js Admin and Storefront repos remain unchanged.

> **Delivery scope:** Phase 02 implements request logging, tagged OpenAPI docs, PostgreSQL/Prisma models and an initial migration, customer registration/login/session refresh/logout, protected `/me`, admin login and a local-only first-OWNER bootstrap. **Do not use for live customer data or payments.** Email verification, password reset, distributed login throttling, complete permission matrix, catalog CRUD, inventory transactions, checkout, Stripe, media upload/deletion, workers, monitoring, and production testing remain unfinished.

## Install/update — Node 24.11+ / PowerShell

The repository and npm package name are now `kookaburra-backend`. The existing local development PostgreSQL database remains `kookaburra-api-dev`, and the isolated API test database remains `kookaburra_api_test` on purpose. Do not rename either database or change API routes as part of this repository rename. See `docs/REPOSITORY_RENAME.md`.

1. Download and extract the `.tar.gz` patch to the existing `kookaburra-backend` repo root.
2. `nvm use 24` then `node -v` (require `v24.11.0` or newer within v24).
3. `npm install` — important: dependencies have changed. Commit its refreshed `package-lock.json`.
4. If absent, `Copy-Item .env.example .env`, then edit `.env` locally. The file must never enter Git. If already present, **add new variables manually**; do not overwrite existing `.env`.
5. `npm run check` — generates Prisma Client, validates schema, TypeScript, lint, Jest, E2E and build (no live DB is accessed by smoke tests).
6. `npm run dev`; view `http://localhost:4000/docs` and `/v1/health`.

### Add PostgreSQL to test authentication

Use a **fresh, empty** PostgreSQL DB, either local/VPS or a managed provider. For Neon-like serverless setups, use pooled `DATABASE_URL` for API runtime and direct `DIRECT_URL` for Prisma CLI migrations (read provider's recommended connection strings/TLS settings).

```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
SWAGGER_ENABLED=true
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@DIRECT_HOST:5432/DATABASE?sslmode=require
JWT_ACCESS_SECRET=GENERATE_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

`DIRECT_URL` is optional only when your DB's runtime URL also works for direct migrations. Never paste real credentials or JWT secrets into chat. Never put server secrets in `NEXT_PUBLIC_` variables.

```powershell
npm run db:generate
npm run db:validate
npm run db:deploy       # applies committed initial migration; do this ONLY to an empty/test DB after reviewing it
npm run db:status
npm run dev
```

**Never run `prisma migrate reset` on a database with data.** This Phase 02 SQL migration is an initial schema, not an upgrade for a preexisting e-commerce database. Take a backup before any deployment. Verify migration/schema diff before commercial use.

### First Admin OWNER (local terminal only)

After migrations, create exactly one owner account. Do **not** put the temporary plaintext password into `.env`, a script or Git. In the same local PowerShell session:

```powershell
$env:BOOTSTRAP_OWNER_EMAIL = Read-Host 'First OWNER email'
$secure = Read-Host 'OWNER password (12+ characters)' -AsSecureString
$env:BOOTSTRAP_OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
npm run bootstrap:owner
Remove-Item Env:BOOTSTRAP_OWNER_PASSWORD
Remove-Item Env:BOOTSTRAP_OWNER_EMAIL
```

Keep the password secure. The command refuses to create a second owner or overwrite any existing account. There is deliberately **no public admin registration API**.

## Swagger (by module)

- `System / Health` — `GET /v1/health` (liveness, **not** database readiness).
- `Authentication / Customer` — `POST /v1/auth/register`, `/login`, `/refresh`, `/logout`, `GET /v1/auth/me`.
- `Authentication / Admin` — `POST /v1/admin/auth/login`, `GET /v1/admin/auth/me`.

Click Swagger **Authorize**, provide a short-lived access token for protected `/me` requests. JWT access lifetime: 15 minutes. Opaque refresh tokens rotate on use and expire after 30 days; hashes are stored in DB. Refresh tokens are not JWTs. No browser token storage integration has been done yet: **do not put refresh tokens in `localStorage`**. Use secure, HttpOnly cookies/BFF or appropriate mobile secure storage when integrating clients.

## Request logging

Every completed request logs, e.g., `GET /v1/health -> 200 (13ms) [a1b2c3d4]`. Response includes an `X-Request-Id` for correlating errors. Logs deliberately exclude query strings, auth tokens, request and response bodies, passwords and cookies. Access logs are **not** sufficient monitoring or an audit system on their own.

## Known gates (do not claim production-ready yet)

- Run `npm audit --omit=dev` and remediate high issues; old project had 35 overall vulnerabilities from local `npm install` (severity distribution not necessarily production-only).
- Configure provider-edge/distributed rate limiting for login and registration and email verification/password reset before public launch. There is no claim that NestJS memory-based limits are globally enforced across Vercel functions.
- Add permission-based admin policies, e.g. `product.edit`, `order.refund`, `stock.adjust`. Current admin guarding checks STAFF/ADMIN/OWNER role on `/admin/auth/me` only.
- Implement staged DB changes, integration tests against real PostgreSQL, proper migrations/backups/restore checks, observability and deployment smoke tests.
- Catalog product/category CRUD arrives in Phase 03A (pending local acceptance); inventory ledger, orders, checkout, payment, media and queue features are later phases. Canonical IDs are preserved; **no demo fixtures imported**.
- For Vercel Functions, use hosted PostgreSQL with connection pooling, separate migration/direct URL, and do not place media on ephemeral function filesystem.

## Deployment constraints

Node 24.11+, Prisma 7 with driver adapter and generated CommonJS Prisma Client. `npm run build` regenerates Prisma Client then compiles NestJS; do not skip `prisma generate` on fresh CI installs. `NODE_ENV=production` requires explicit exact HTTPS CORS origins, database URL and strong JWT secret. Swagger defaults off in production; ensure `SWAGGER_ENABLED=false` for public commercial stores.

## Phase 03A catalog (unverified local acceptance)

Catalog GET/CRUD, variants, and migration are added in this patch. See [`docs/PHASE03A_CATALOG.md`](docs/PHASE03A_CATALOG.md) for the complete API scope, safe local deployment, and required test gates. Do not connect either frontend or treat these routes as production-ready until local PostgreSQL and security tests pass.
