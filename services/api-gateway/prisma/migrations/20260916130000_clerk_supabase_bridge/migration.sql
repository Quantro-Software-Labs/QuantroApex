-- Transitional Prisma migration notes (Clerk + notification channels)
-- Prefer applying supabase/migrations/20260916120000_init.sql on a fresh Supabase project.
-- Use this only when upgrading an existing Prisma-managed database.

-- 1) Drop refresh tokens (Clerk owns sessions)
DROP TABLE IF EXISTS refresh_tokens;

-- 2) Replace password_hash with clerk_id
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id text;
-- Backfill required before NOT NULL; for empty DBs:
UPDATE users SET clerk_id = id WHERE clerk_id IS NULL;
ALTER TABLE users ALTER COLUMN clerk_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_id_key ON users(clerk_id);

-- 3) Twilio preference columns
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_e164 text;
