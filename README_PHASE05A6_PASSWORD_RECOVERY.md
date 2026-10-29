# KOOKABURRA G2 / 05A-6 — Password Reset Foundation

**Overlay:** `KOOKABURRA_G2_PHASE05A6_PASSWORD_RESET_OVERLAY.tar.gz`  
**Baseline:** `kookaburra-backend-full-20261029-172151.zip` (uploaded 2026-10-29)  
**Status:** SOURCE PREPARED / LOCAL ACCEPTANCE PENDING. G2 and G1 remain OPEN.

## Scope

- `POST /v1/auth/password-reset/request` (public, validated email): always `202 {"accepted":true}` for existing customer, missing, staff or disabled accounts. No account identification, token, email or JWT returned. An unconfigured action encryption key fails consistently (`503`) and queues nothing.
- `POST /v1/auth/password-reset/confirm` (public): consumes a 48-byte random URL-safe token, sets a distinct 12–128-character new password, increments session epoch, revokes all refresh sessions, and audits without secrets; single PostgreSQL transaction under user lock. Access JWTs minted before the reset fail immediately on subsequent requests.
- `PasswordResetChallenge`: single per-user token SHA-256 hash, 30-minute expiry, consumed timestamp, 60-second cooldown and max five new tokens/hour; concurrent issuance/consumption serialized by user row lock.
- Outbox event `auth.password_reset.requested` stores encrypted AES-256-GCM token only (binding `userId:eventId`). G7 must decrypt **only** in backend worker, re-check user role/status, challenge hash/expiry/consumed state and deliver to the canonical current email. Do not log/serve outbox token or send stale queued links. No email/SMTP sent in this phase.
- Authenticated `change-password` now consumes any pending reset challenge inside its existing atomic transaction, preventing an old recovery link from overriding the change.
- No customer email verification state or order/checkout, commerce amounts, payment, inventory or Flutter code is modified.

## Before applying (Windows PowerShell)

**Verify that the current folder is the intended local Backend and that both databases are different, local and freshly backed up.** Do not reset either database. Apply only to the new baseline; never reapply previous overlays blindly.

```powershell
cd 'C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend'
tar -tzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A6_PASSWORD_RESET_OVERLAY.tar.gz"
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A6_PASSWORD_RESET_OVERLAY.tar.gz" -C .
```

Uses the **existing** `AUTH_ACTION_TOKEN_ENCRYPTION_KEY` established by G2-5; keep it private and do not replace a configured key without an approved rotation/migration, or previously queued verification payloads will become undecryptable.

```powershell
npm run db:generate
npm run db:validate
npm run db:status
npm run db:deploy
npm run db:status
npm run test:api:db:deploy
npm run check
npm run test:api:smoke
npm run test:api:db
npm run test:api:security
npm run test:api:visual:password-reset
npm run test:api:visual:email-verification
npm run test:api:visual:password-change
npm run test:api:visual:all
npm run alignment:audit
npm run alignment:test
```

### Migration

`prisma/migrations/20261029183000_phase05a6_password_reset_challenge/migration.sql` is **additive**. It creates only `password_reset_challenges`, index and FK, without deleting or rewriting existing history. The test DB migration uses the guarded `test:api:db:deploy` runner. Take backups before running the deployment commands.

### Test plan / acceptance

- Jest: no account enumeration, staff denial, invalid-token non-mutating rejection and password-change invalidation.
- Real PostgreSQL API: token ciphertext vs digest, cooldown/hourly quota, resend/expiry/replay, two parallel confirms (only one succeeds), login/session revocation, unchanged unrelated account records.
- Security: malformed DTO/extra role field denial, unknown/staff/disabled indistinguishable responses, no secrets in HTTP.
- Swagger: strict documented response/DTO contract; focused Chromium `Try it out → Execute`, full suite and alignment checks.

**Do not mark LOCAL VALIDATED until Windows/PostgreSQL/Chromium suites genuinely PASS.** Previous G2-5 acceptance is owner-reported, not independently reproduced here. This is not a G7 delivery implementation; rate-limit/WAF and external SMTP delivery still need release acceptance.
