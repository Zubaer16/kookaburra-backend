# KOOKABURRA V2 — G2 / Phase 05A-5: Email Verification Token Foundation

**Baseline:** `kookaburra-backend-full-20261029-144817.zip` (381 ZIP entries). G2-4 owner reports all commands completed; source reviewed in this ZIP. Original project structure and API prefix `/v1` preserved.

**Status:** SOURCE PREPARED / LOCAL ACCEPTANCE PENDING. No PostgreSQL/Chromium execution was performed during patch authoring. G1/G2 remain OPEN.

## Scope

- `POST /v1/auth/email-verification/request`: active CUSTOMER Bearer JWT only; accepts no email input; returns HTTP 202 `{ "accepted": true }`, no token exposure. Resend cooldown 60 seconds; one active challenge per user.
- `POST /v1/auth/email-verification/confirm`: consumes an opaque 48-byte random token in a 30-minute window exactly once and sets `users.email_verified_at`; two simultaneous confirmations cannot both succeed.
- `GET /v1/account/profile` now includes `emailVerified: boolean` (no raw timestamp/PII leakage).
- New `email_verification_challenges` table and nullable verified-at column; additive migration `20261029164500_phase05a5_email_verification_challenge`.
- Issuance transaction writes PII-safe audit and `auth.email_verification.requested` PostgreSQL outbox event containing only recipient `userId`, expiry, and AES-256-GCM-encrypted token. AES associated data binds ciphertext to user/event IDs. Do not log or expose decrypted tokens; customer email is obtained privately by G7 sender.
- Test runner creates a fresh ephemeral action key, and tests only use guarded local `kookaburra_api_test` DB.

**Important boundary:** No SMTP sender or public verification links are delivered in G2-5. G7 must implement an authenticated, reliable sender that decrypts the event in a secure backend process, checks `tokenHash`/expiry before delivery, and uses permitted templated first-party links. The public endpoint is callable only by someone who already possesses a valid one-time token. Until G7, G2-5 is a **foundation, not a complete end-user email verification flow**. Existing unverified accounts remain usable; login/payment/checkout are NOT blocked by verification state. Password reset is also NOT implemented by this patch. No existing customers are automatically verified. Frontend email-verification UI comes during I-SF.

## Required secret and key rotation

Set a distinct secret in the backend `.env` (do not commit it): `AUTH_ACTION_TOKEN_ENCRYPTION_KEY` = 64 hex characters representing 32 cryptographically random bytes. Example PowerShell key generation: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. A malformed configured key fails startup config validation; missing key causes **only verification request** to fail with HTTP 503. Never expose keys or plaintext tokens in logs, URLs of arbitrary sites, test reports, or frontend bundles. Rotating the key while encrypted outbox events remain pending makes those events undecryptable. Back up/rotate safely.

## Apply (PowerShell after independent dev + test DB backups and identity checks)

```powershell
tar -xzf "$env:USERPROFILE\Downloads\KOOKABURRA_G2_PHASE05A5_EMAIL_VERIFICATION_OVERLAY.tar.gz" -C .

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

npm run test:api:visual:email-verification
npm run test:api:visual:password-change
npm run test:api:visual:account
npm run test:api:visual:all

npm run alignment:audit
npm run alignment:test
```

Do not use `prisma migrate reset`, alter old migration history, weaken tests or assume any PASS without actual Windows evidence.

## Acceptance checklist

Validate isolated test DB identities/migration status and backups first. Assert OpenAPI endpoints, authenticated-only issuance, staff rejection, 60-second cooldown, token hash-only DB storage, AES-GCM at-rest payload encryption, replay/expiry behavior, one-time parallel consumption, profile verified flag and password-change regressions. Keep raw Windows logs separate from Master Docs. The patch does not change provider/payment/inventory/fulfillment/notifications module behavior.

**Owner-held Master Docs:** replace `01_PROJECT_CONTEXT.md` and `03_BACKEND_ROADMAP_STATUS.md` separately outside repos. `02_ARCHITECTURE_DECISIONS.md` unchanged.
