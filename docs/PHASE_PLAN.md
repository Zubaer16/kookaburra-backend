# Delivery roadmap (verified scope, not marketing completion)

## Phase 01 — Bootstrap and HTTP foundation

- [x] NestJS dev server and HTTP 200 health verified by user screenshot.
- [x] Environment/CORS fixes authored; full final `npm run check` output not received.
- [ ] Vercel preview deployment smoke-test.
- [ ] Dependency audit and fixes.

## Phase 02 — This overlay: persistence and identity foundation

- [x] HTTP request completion logs (status, duration, request ID; no secrets).
- [x] Swagger module-tagged customer/admin/system endpoints.
- [x] PostgreSQL Prisma schema + initial SQL migration authored.
- [x] Customer register/login/me, access JWT, rotate/revoke opaque refresh sessions.
- [x] Staff admin login and protected me; local first owner bootstrap (no public admin sign-up).
- [x] Canonical product/category/variant identity, outbox/idempotency schema foundations.
- [ ] Live Postgres migration, actual DB integration tests, complete `npm run check`, audit/production verification (requires user's environment).
- [ ] Email verification/password reset, distributed brute force protection, granular staff permissions.

## Phase 03 — Catalog, inventory, media

- [x] Catalog CRUD/read; SKU-level atomic inventory (earlier user-validated phases).
- [x] Phase 03C-1 Cloudinary direct-signed upload/verification and provider interface; namespace isolation (requires Windows/local test + real Cloudinary verification).
- [ ] S3/R2/VPS media adapters and provider switching tests.
- [x] DB-backed ordered galleries, reference-aware archive/replace, 7-day deletion jobs, retry/recovery worker (implementation pending local E2E validation).
- [ ] Provider-specific rendition processing, operational cron/worker deployment verification and CDN cache purge timing acceptance.

## Phase 04 — Checkout, payment, orders

- [ ] Server-side quotes, shipping/tax and stock reservations.
- [ ] Order snapshots, Stripe TEST mode, webhook verification/idempotency.

## Phase 05 — Frontend integration and rollout

- [ ] OpenAPI-generated clients for Admin/Storefront/Flutter.
- [ ] Remove fixtures and verify real workflows against isolated DB.
- [ ] E2E/security/load/backup/recovery tests, Vercel and VPS deploy tests.
