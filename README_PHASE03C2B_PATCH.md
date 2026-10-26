# Kookaburra v2 — Phase 03C-2B VPS disk provider patch

Source baseline: `kookaburra-backend-full-20261026-140643.zip`.

Apply at the root of the existing backend repository (incremental overlay; do **not** delete or reset databases):

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-phase03c2b-vps-disk-media-20261026.tar.gz" -C .
```

Then run:

```powershell
npm run check
npm run test:api:smoke
npm run test:api:db:deploy
npm run test:api:db
npm run test:api:security
npm run test:api:visual:smoke
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

**No Prisma migration**, no Node dependencies, no Admin/Storefront code changes. Default storage provider remains `cloudinary`. For local tests, the guarded DB/Swagger runners select disk storage in an isolated OS temporary folder, while security runners deliberately use unconfigured Cloudinary. This tests the actual PUT and published file routes against `kookaburra_api_test` only.

See `docs/PHASE03C2B_VPS_DISK_PROVIDER.md` for VPS-only config, signed PUT HTTP headers, image download gating, retention/deletion, backup, and explicit deferred work (responsive image generation / external CDN purge / real VPS deployment acceptance).

Never use this provider with ephemeral Vercel Functions. Do not expose MEDIA_DISK_ROOT to Nginx or serve files directly from a static directory: access to published files is gated by NestJS/Prisma.
