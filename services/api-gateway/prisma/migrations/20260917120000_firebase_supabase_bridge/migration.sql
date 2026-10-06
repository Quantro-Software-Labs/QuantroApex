-- Firebase Auth bridge: rename clerk_id → firebase_uid and align multi-class vaults / waitlist / subscriptions / KYC / manual orders.

-- 1) firebase_uid (from clerk_id if present)
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid text;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'clerk_id'
  ) THEN
    UPDATE users SET firebase_uid = COALESCE(firebase_uid, clerk_id, id) WHERE firebase_uid IS NULL;
  ELSE
    UPDATE users SET firebase_uid = COALESCE(firebase_uid, id) WHERE firebase_uid IS NULL;
  END IF;
END $$;
ALTER TABLE users ALTER COLUMN firebase_uid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_key ON users(firebase_uid);
ALTER TABLE users DROP COLUMN IF EXISTS clerk_id;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- 2) Optional phone / preferred market / last seen
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_market text NOT NULL DEFAULT 'US_MARKETS';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON users(phone) WHERE phone IS NOT NULL;

-- 3) Risk vaults: per asset class
ALTER TABLE risk_vaults ADD COLUMN IF NOT EXISTS asset_class text;
UPDATE risk_vaults SET asset_class = 'STOCKS' WHERE asset_class IS NULL;
ALTER TABLE risk_vaults ALTER COLUMN asset_class SET NOT NULL;
ALTER TABLE risk_vaults ADD COLUMN IF NOT EXISTS assets_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE risk_vaults ADD COLUMN IF NOT EXISTS emergency_stop boolean NOT NULL DEFAULT false;
DROP INDEX IF EXISTS risk_vaults_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS risk_vaults_user_id_asset_class_key ON risk_vaults(user_id, asset_class);

-- 4) Orders / trades owner + extended order fields
DO $$ BEGIN
  CREATE TYPE "TradeOwner" AS ENUM ('APEX', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS owner "TradeOwner" NOT NULL DEFAULT 'APEX';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asset_class text NOT NULL DEFAULT 'STOCKS';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stop_price numeric(18,4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS trailing_amount numeric(18,4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS take_profit numeric(18,4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stop_loss numeric(18,4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_oco boolean NOT NULL DEFAULT false;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS owner "TradeOwner" NOT NULL DEFAULT 'APEX';

-- 5) Waitlist
CREATE TABLE IF NOT EXISTS waitlist (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_class text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_class)
);

-- 6) Subscriptions (Paystack)
DO $$ BEGIN
  CREATE TYPE "PlanTier" AS ENUM ('FREE', 'CORE', 'PRO', 'ELITE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan "PlanTier" NOT NULL DEFAULT 'FREE',
  paystack_code text,
  paystack_email text,
  active_until timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7) KYC (Sumsub)
DO $$ BEGIN
  CREATE TYPE "KYCStatus" AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status "KYCStatus" NOT NULL DEFAULT 'PENDING',
  sumsub_applicant_id text,
  sumsub_review_id text,
  document_type text,
  country_code text,
  rejection_reason text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
