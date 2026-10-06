-- QuantroApex initial schema (Prisma 1:1 Supabase Sync)
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Enums (matching Prisma schema.prisma)
-- =============================================================================

CREATE TYPE experience_level AS ENUM ('NEWCOMER', 'INTERMEDIATE', 'PROFESSIONAL');
CREATE TYPE digest_interval AS ENUM ('OFF', 'DAILY', 'WEEKLY');
CREATE TYPE onboarding_path AS ENUM ('NEWCOMER', 'EXPRESS');
CREATE TYPE portfolio_mode AS ENUM ('LIVE', 'SIM');
CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type AS ENUM ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT', 'TRAILING_STOP');
CREATE TYPE order_status AS ENUM (
  'PENDING',
  'SUBMITTED',
  'ACCEPTED',
  'FILLED',
  'PARTIALLY_FILLED',
  'CANCELLED',
  'REJECTED'
);
CREATE TYPE trade_owner AS ENUM ('APEX', 'MANUAL');
CREATE TYPE agent_phase AS ENUM ('SEED', 'LEARNING', 'ADAPTING', 'AUTONOMOUS');
CREATE TYPE asset_class AS ENUM ('CRYPTO', 'STOCKS', 'FOREX', 'GLOBAL');
CREATE TYPE risk_level AS ENUM ('CONSERVATIVE', 'GROWTH', 'AGGRESSIVE', 'EXPERIMENTAL');
CREATE TYPE activity_event_type AS ENUM (
  'TRADE_OPENED',
  'TRADE_CLOSED',
  'POSITION_ADJUSTED',
  'TRADING_PAUSED',
  'TRADING_RESUMED',
  'STRATEGY_CHANGED',
  'RISK_LIMIT_HIT',
  'EMERGENCY_STOP',
  'AGENT_PHASE_CHANGED',
  'SYSTEM'
);
CREATE TYPE market_data_source AS ENUM ('ALPACA', 'POLYGON', 'CCXT', 'OANDA', 'SIMULATED');
CREATE TYPE plan_tier AS ENUM ('FREE', 'CORE', 'PRO', 'ELITE');
CREATE TYPE kyc_status AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- users (Firebase Auth backed)
-- =============================================================================

CREATE TABLE users (
  id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  firebase_uid             text NOT NULL UNIQUE,
  email                    text UNIQUE,
  phone                    text UNIQUE,
  name                     text NOT NULL DEFAULT 'QuantroApex User',
  first_name               text,
  last_name                text,
  preferred_market         text NOT NULL DEFAULT 'US_MARKETS',
  experience_level         experience_level NOT NULL DEFAULT 'NEWCOMER',
  onboarding_completed_at  timestamptz,
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- user_profiles
-- =============================================================================

CREATE TABLE user_profiles (
  id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id                 text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  risk_profile            jsonb,
  trading_capital         numeric(18, 2),
  preferred_trading_mode  portfolio_mode NOT NULL DEFAULT 'SIM',
  global_brain_consent    boolean NOT NULL DEFAULT false,
  alpaca_api_key          text,
  alpaca_secret_key       text,
  is_broker_connected     boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- onboarding_progress
-- =============================================================================

CREATE TABLE onboarding_progress (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  path          onboarding_path NOT NULL DEFAULT 'NEWCOMER',
  current_step  integer NOT NULL DEFAULT 1,
  state         jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER onboarding_progress_set_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- risk_vaults
-- =============================================================================

CREATE TABLE risk_vaults (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id               text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_class           asset_class NOT NULL,
  daily_loss_limit      numeric(18, 2) NOT NULL,
  max_drawdown          numeric(5, 4) NOT NULL,
  per_trade_exposure    numeric(5, 4) NOT NULL,
  assets_enabled        boolean NOT NULL DEFAULT true,
  emergency_stop        boolean NOT NULL DEFAULT false,
  emergency_stopped_at  timestamptz,
  crypto_enabled        boolean NOT NULL DEFAULT false,
  stocks_enabled        boolean NOT NULL DEFAULT true,
  forex_enabled         boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_class)
);

CREATE INDEX risk_vaults_user_id_idx ON risk_vaults (user_id);

CREATE TRIGGER risk_vaults_set_updated_at
  BEFORE UPDATE ON risk_vaults
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- waitlist
-- =============================================================================

CREATE TABLE waitlist (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_class  asset_class NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset_class)
);

-- =============================================================================
-- strategies
-- =============================================================================

CREATE TABLE strategies (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  description        text NOT NULL,
  asset_class        asset_class NOT NULL,
  risk_level         risk_level NOT NULL,
  style              text NOT NULL,
  rules              jsonb NOT NULL,
  backtest_summary   jsonb NOT NULL,
  active_user_count  integer NOT NULL DEFAULT 0,
  is_premium         boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER strategies_set_updated_at
  BEFORE UPDATE ON strategies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- user_strategies
-- =============================================================================

CREATE TABLE user_strategies (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_id  text NOT NULL REFERENCES strategies(id),
  is_active    boolean NOT NULL DEFAULT true,
  selected_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, strategy_id)
);

CREATE INDEX user_strategies_user_id_idx ON user_strategies (user_id);

-- =============================================================================
-- portfolios / positions
-- =============================================================================

CREATE TABLE portfolios (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode          portfolio_mode NOT NULL,
  cash_balance  numeric(18, 2) NOT NULL DEFAULT 0,
  equity        numeric(18, 2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

CREATE TRIGGER portfolios_set_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE positions (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  portfolio_id        text NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol              text NOT NULL,
  quantity            numeric(18, 8) NOT NULL,
  average_cost        numeric(18, 4) NOT NULL,
  broker_position_id  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, symbol)
);

CREATE TRIGGER positions_set_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- orders / trades
-- =============================================================================

CREATE TABLE orders (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol            text NOT NULL,
  asset_class       asset_class NOT NULL DEFAULT 'STOCKS',
  side              order_side NOT NULL,
  order_type        order_type NOT NULL,
  quantity          numeric(18, 8) NOT NULL,
  limit_price       numeric(18, 4),
  stop_price        numeric(18, 4),
  trailing_amount   numeric(18, 4),
  take_profit       numeric(18, 4),
  stop_loss         numeric(18, 4),
  is_oco            boolean NOT NULL DEFAULT false,
  owner             trade_owner NOT NULL DEFAULT 'APEX',
  status            order_status NOT NULL DEFAULT 'PENDING',
  is_simulated      boolean NOT NULL DEFAULT false,
  broker_order_id   text,
  idempotency_key   text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_id_created_at_idx ON orders (user_id, created_at);
CREATE INDEX orders_user_id_status_idx ON orders (user_id, status);
CREATE INDEX orders_user_id_owner_idx ON orders (user_id, owner);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE trades (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id        text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fill_price      numeric(18, 4) NOT NULL,
  fill_quantity   numeric(18, 8) NOT NULL,
  realized_pnl    numeric(18, 2),
  ai_reasoning    text,
  market_context  jsonb,
  owner           trade_owner NOT NULL DEFAULT 'APEX',
  filled_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trades_order_id_idx ON trades (order_id);
CREATE INDEX trades_filled_at_idx ON trades (filled_at);
CREATE INDEX trades_owner_idx ON trades (owner);

-- =============================================================================
-- activity_feed_entries
-- =============================================================================

CREATE TABLE activity_feed_entries (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  activity_event_type NOT NULL,
  message     text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_feed_entries_user_id_created_at_idx
  ON activity_feed_entries (user_id, created_at);
CREATE INDEX activity_feed_entries_user_id_event_type_idx
  ON activity_feed_entries (user_id, event_type);

-- =============================================================================
-- agent_states
-- =============================================================================

CREATE TABLE agent_states (
  id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id              text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phase                agent_phase NOT NULL DEFAULT 'SEED',
  current_strategy_id  text REFERENCES strategies(id),
  is_running           boolean NOT NULL DEFAULT false,
  started_at           timestamptz,
  stopped_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER agent_states_set_updated_at
  BEFORE UPDATE ON agent_states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- notification_preferences
-- =============================================================================

CREATE TABLE notification_preferences (
  id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id              text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  digest_interval      digest_interval NOT NULL DEFAULT 'DAILY',
  milestone_alerts     boolean NOT NULL DEFAULT true,
  loss_threshold_pct   numeric(5, 2),
  loss_alerts_enabled  boolean NOT NULL DEFAULT true,
  push_enabled         boolean NOT NULL DEFAULT true,
  fcm_token            text,
  email_enabled        boolean NOT NULL DEFAULT true,
  whatsapp_enabled     boolean NOT NULL DEFAULT false,
  sms_enabled          boolean NOT NULL DEFAULT false,
  phone_e164           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- subscriptions
-- =============================================================================

CREATE TABLE subscriptions (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan            plan_tier NOT NULL DEFAULT 'FREE',
  paystack_code   text,
  paystack_email  text,
  active_until    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- kyc_verifications
-- =============================================================================

CREATE TABLE kyc_verifications (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id               text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status                kyc_status NOT NULL DEFAULT 'PENDING',
  sumsub_applicant_id   text,
  sumsub_review_id      text,
  document_type         text,
  country_code          text,
  rejection_reason      text,
  verified_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER kyc_verifications_set_updated_at
  BEFORE UPDATE ON kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- market_observations / trade_learning_data
-- =============================================================================

CREATE TABLE market_observations (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  symbol              text NOT NULL,
  asset_class         asset_class NOT NULL,
  price               numeric(18, 8) NOT NULL,
  change_pct_24h      numeric(12, 4) NOT NULL,
  volume              numeric(24, 2) NOT NULL,
  technical_snapshot  jsonb NOT NULL,
  market_context      jsonb NOT NULL,
  source              market_data_source NOT NULL,
  observed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX market_observations_symbol_observed_at_idx
  ON market_observations (symbol, observed_at);
CREATE INDEX market_observations_asset_class_observed_at_idx
  ON market_observations (asset_class, observed_at);
CREATE INDEX market_observations_source_observed_at_idx
  ON market_observations (source, observed_at);

CREATE TABLE trade_learning_data (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol              text NOT NULL,
  asset_class         asset_class NOT NULL,
  side                order_side NOT NULL,
  quantity            numeric(18, 8) NOT NULL,
  price               numeric(18, 4) NOT NULL,
  realized_pnl        numeric(18, 2),
  is_win              boolean,
  technical_snapshot  jsonb,
  market_context      jsonb,
  source              market_data_source NOT NULL DEFAULT 'SIMULATED',
  is_simulated        boolean NOT NULL DEFAULT true,
  observation_id      text REFERENCES market_observations(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trade_learning_data_user_id_created_at_idx
  ON trade_learning_data (user_id, created_at);
CREATE INDEX trade_learning_data_asset_class_is_win_idx
  ON trade_learning_data (asset_class, is_win);
CREATE INDEX trade_learning_data_source_created_at_idx
  ON trade_learning_data (source, created_at);
CREATE INDEX trade_learning_data_user_id_symbol_created_at_idx
  ON trade_learning_data (user_id, symbol, created_at);
