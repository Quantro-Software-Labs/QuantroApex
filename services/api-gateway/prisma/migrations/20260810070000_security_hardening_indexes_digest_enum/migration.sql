-- Security Hardening Migration: Indexes + DigestInterval Enum + Table rename
-- Generated as part of QuantroApex security audit sprint

-- 1. Rename activity_feed table to activity_feed_entries (if not already done)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_feed' AND table_schema = 'public') THEN
    ALTER TABLE "activity_feed" RENAME TO "activity_feed_entries";
  END IF;
END $$;

-- 2. Create DigestInterval enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DigestInterval') THEN
    CREATE TYPE "DigestInterval" AS ENUM ('OFF', 'DAILY', 'WEEKLY');
  END IF;
END $$;

-- 3. Migrate digest_interval column from String to DigestInterval enum
-- First, normalise existing string values to uppercase
UPDATE "notification_preferences"
SET digest_interval = UPPER(digest_interval)
WHERE digest_interval IS NOT NULL;

-- Add a temporary column with the new enum type
ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "digest_interval_new" "DigestInterval";

-- Copy existing values, defaulting unrecognised values to 'DAILY'
UPDATE "notification_preferences"
SET "digest_interval_new" = CASE
  WHEN "digest_interval" IN ('OFF', 'DAILY', 'WEEKLY') THEN "digest_interval"::"DigestInterval"
  ELSE 'DAILY'::"DigestInterval"
END;

-- Drop old column, rename new column
ALTER TABLE "notification_preferences" DROP COLUMN IF EXISTS "digest_interval";
ALTER TABLE "notification_preferences" RENAME COLUMN "digest_interval_new" TO "digest_interval";
ALTER TABLE "notification_preferences" ALTER COLUMN "digest_interval" SET NOT NULL;
ALTER TABLE "notification_preferences" ALTER COLUMN "digest_interval" SET DEFAULT 'DAILY'::"DigestInterval";

-- 4. Add compound index on Order(userId, status) for status-filtered queries
CREATE INDEX IF NOT EXISTS "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- 5. Add index on Trade(filledAt) for time-series analytics queries
CREATE INDEX IF NOT EXISTS "trades_filled_at_idx" ON "trades"("filled_at");

-- 6. Add compound index on ActivityFeedEntry(userId, eventType)
CREATE INDEX IF NOT EXISTS "activity_feed_entries_user_id_event_type_idx"
  ON "activity_feed_entries"("user_id", "event_type");
