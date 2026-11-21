-- 1) Enum additions
DO $$ BEGIN ALTER TYPE "AssetClass" ADD VALUE IF NOT EXISTS 'GLOBAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MarketDataSource" ADD VALUE IF NOT EXISTS 'CCXT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "MarketDataSource" ADD VALUE IF NOT EXISTS 'OANDA'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_SUBMIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'STOP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'STOP_LIMIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'TRAILING_STOP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Schema extensions for users, user_profiles, notification_preferences
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'QuantroApex User';
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "alpaca_api_key" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "alpaca_secret_key" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "is_broker_connected" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "email_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "fcm_token" TEXT;

-- 3) Fix column types using USING column::"AssetClass"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'risk_vaults' AND column_name = 'asset_class' AND data_type = 'text'
    ) THEN
        ALTER TABLE "risk_vaults" ALTER COLUMN "asset_class" DROP DEFAULT;
        ALTER TABLE "risk_vaults" ALTER COLUMN "asset_class" TYPE "AssetClass" USING "asset_class"::"AssetClass";
        ALTER TABLE "risk_vaults" ALTER COLUMN "asset_class" SET DEFAULT 'STOCKS';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'asset_class' AND data_type = 'text'
    ) THEN
        ALTER TABLE "orders" ALTER COLUMN "asset_class" DROP DEFAULT;
        ALTER TABLE "orders" ALTER COLUMN "asset_class" TYPE "AssetClass" USING "asset_class"::"AssetClass";
        ALTER TABLE "orders" ALTER COLUMN "asset_class" SET DEFAULT 'STOCKS';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'waitlist' AND column_name = 'asset_class' AND data_type = 'text'
    ) THEN
        ALTER TABLE "waitlist" ALTER COLUMN "asset_class" DROP DEFAULT;
        ALTER TABLE "waitlist" ALTER COLUMN "asset_class" TYPE "AssetClass" USING "asset_class"::"AssetClass";
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "risk_vaults_user_id_idx" ON "risk_vaults"("user_id");

-- 4) Portfolio peak equity & backfill
ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "peak_equity" DECIMAL(18, 2) NOT NULL DEFAULT 0;
UPDATE "portfolios" SET "peak_equity" = "equity" WHERE "peak_equity" = 0 OR "peak_equity" IS NULL;

-- 5) Trade fee
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "fee" DECIMAL(18, 4) NOT NULL DEFAULT 0;

-- 6) Order reservations
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reserved_cash" DECIMAL(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reserved_quantity" DECIMAL(18, 8) NOT NULL DEFAULT 0;
