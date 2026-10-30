# G3 / 05B-2 — Public Store Content Foundation

Source prepared, **local DB/security/Swagger Chromium acceptance pending**.

This is an additive Backend increment following accepted-by-owner G3/05B-1 source in `kookaburra-backend-full-20261030-210128.zip`. No earlier Prisma migration edited. Public read `/v1/store/content` returns `configured:false` and empty strings when not configured. OWNER-only `GET/PUT /v1/admin/store/content` returns `revision` and `updatedAt`; `PUT` requires exact `expectedRevision` (`0` on first save, then the last revision). Competing edits return HTTP 409 and do not create an audit event. Both successful create and update are atomically audited under `store.content.updated`; audit excludes policy text and any PII. Content is plain text, never HTML or interpreted links. Frontends must render it as text, not `dangerouslySetInnerHTML`.

This API publishes the supplied policy wording and SEO metadata only: **it is not a legal compliance or worldwide tax guarantee**. Configured content may still contain empty strings; clients must write their own approved policies. It does not change robots/sitemap, logo/favicon/media references, domain/CORS, checkout, shipping/tax, order IDs or payment behaviors. Admin and Storefront adapters belong to later live integration work. G3 remains OPEN.

Additive migration: `20261030213500_phase05b2_store_public_content`. Backup both local dev/test PostgreSQL identities before `db:deploy` / `test:api:db:deploy`; never reset historical data. Run `npm run check`, API smoke/DB/security, `npm run test:api:visual:store-content`, `npm run test:api:visual:all` and frontend alignment audit/tests with both frontend paths configured. Owner-reported PASS on preceding G3-1 does not prove this patch PASS.
