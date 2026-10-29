-- 05A-4: A monotonically increasing per-user session epoch invalidates
-- existing access JWTs after a verified password change.
-- Backfill is deterministic (0): old access JWTs without sv remain usable
-- only until password change, their original expiry or account disablement.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "auth_sessions" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
