# G3 / 05B-3 — Verified Store Logo & Favicon Media (Backend overlay)

Baseline: `kookaburra-backend-full-20261030-215319.zip` (421 entries). This additive patch assumes G3/05B-2 is already applied; do not reapply earlier phases. **SOURCE PREPARED; LOCAL WINDOWS/DB/CHROMIUM ACCEPTANCE PENDING**.

- Public `GET /v1/store/branding` returns `configured`, public verified `{id,url,mimeType,width,height}` logo/favicon; never storage credentials, provider key or raw unchecked URL.
- OWNER-only `GET/PUT /v1/admin/store/branding`; PUT expects `expectedRevision`, `logoMediaId` and `faviconMediaId` (UUID or explicit null). Empty initial state revision 0; stale revision 409. Full replacement is atomic, with audit metadata only.
- Reuse existing `/v1/admin/media/uploads`, `POST /media/:id/complete` for verification and storage. The branding API does NOT accept upload bytes, URLs, SVG, auth role, media provider identity, or arbitrary assets; logo accepts verified image PNG/JPEG/WebP/AVIF and favicon additionally requires square 32–512px and excludes JPEG.
- Prisma additive `20261030221000_phase05b3_store_branding_media` binds media via ON DELETE RESTRICT FKs, singleton `primary`, revision check. Shared product/brand links now guard delete, retry, reconciliation, orphan detection, cleanup claim and published disk media retrieval. Binding may cancel a still-PENDING deletion under the asset row lock; never resurrect a PROCESSING or DELETED asset.
- Detaching does not immediately call provider deletes; existing media reconciliation or explicit unreferenced-delete endpoint schedules retention-protected cleanup. A brand asset shared with a product remains safe. No changes to prior migrations or financial flows.
- Tests: DTO and service Jest; OpenAPI smoke, real local PostgreSQL state/cleanup contract, auth/security and focused/full Swagger Chromium. Development/test DB backups required before deploy; no local PASS claimed here.
- Not included: theme builder, hosting/CORS/domain redirects, store logo UI integration, uploaded SVG, provider external live acceptance, shipping/tax rules, locale and order-prefix policy. Gate G3 stays OPEN.
