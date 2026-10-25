# Contract Alignment Audit patch — 2026-10-25

Apply ONLY to `kookaburra-backend` (an additive contract/tooling patch).

Changed/new files:

- `package.json` (adds alignment:audit, alignment:gate, alignment:test npm commands)
- `contracts/frontend-alignment.v1.json` (source-derived baseline, statuses and decisions)
- `scripts/check-frontend-alignment.cjs` (dependency-free cross-repository inspection; read-only)
- `scripts/check-frontend-alignment.spec.cjs` (Node built-in test runner)
- `docs/FRONTEND_BACKEND_ALIGNMENT_20261025.md` (detailed matrix and implementation sequence)

**Nothing in NestJS runtime, Prisma migrations, Admin or Storefront production files is modified.**

This is stage A0: contract inventory, not a completed integration. `alignment:gate` intentionally exits nonzero while P0 decisions remain open. Run normal `npm run check` for production code quality separately.
