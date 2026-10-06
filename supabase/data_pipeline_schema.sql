-- QuantroApex Data Pipeline tables
-- Run in Supabase SQL editor after (Pro): CREATE EXTENSION IF NOT EXISTS timescaledb;
-- Or let the service apply schema: python services/data-pipeline/main.py setup

CREATE TABLE IF NOT EXISTS market_ohlcv (
  time          TIMESTAMPTZ     NOT NULL,
  symbol        TEXT            NOT NULL,
  exchange      TEXT            NOT NULL,
  asset_class   TEXT            NOT NULL,
  timeframe     TEXT            NOT NULL,
  open          DOUBLE PRECISION NOT NULL,
  high          DOUBLE PRECISION NOT NULL,
  low           DOUBLE PRECISION NOT NULL,
  close         DOUBLE PRECISION NOT NULL,
  volume        DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (time, symbol, exchange, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_tf_time
  ON market_ohlcv (symbol, timeframe, time DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_exchange_time
  ON market_ohlcv (exchange, time DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_asset_class
  ON market_ohlcv (asset_class, symbol);

CREATE TABLE IF NOT EXISTS labelled_samples (
  id              BIGSERIAL       PRIMARY KEY,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  symbol          TEXT            NOT NULL,
  exchange        TEXT            NOT NULL,
  asset_class     TEXT            NOT NULL,
  timeframe       TEXT            NOT NULL,
  strategy_id     TEXT            NOT NULL,
  entry_time      TIMESTAMPTZ     NOT NULL,
  exit_time       TIMESTAMPTZ,
  entry_price     DOUBLE PRECISION NOT NULL,
  exit_price      DOUBLE PRECISION,
  direction       TEXT            NOT NULL,
  outcome         TEXT,
  pnl_pct         DOUBLE PRECISION,
  hold_duration   INTEGER,
  market_regime   TEXT,
  features        JSONB           NOT NULL,
  signal_strength DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_samples_strategy
  ON labelled_samples (strategy_id, symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_samples_outcome
  ON labelled_samples (outcome, asset_class);

CREATE INDEX IF NOT EXISTS idx_samples_entry_time
  ON labelled_samples (entry_time DESC);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id            BIGSERIAL     PRIMARY KEY,
  symbol        TEXT          NOT NULL,
  exchange      TEXT          NOT NULL,
  timeframe     TEXT          NOT NULL,
  from_time     TIMESTAMPTZ   NOT NULL,
  to_time       TIMESTAMPTZ   NOT NULL,
  candles_count INTEGER       NOT NULL,
  ingested_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status        TEXT          NOT NULL DEFAULT 'SUCCESS'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_unique
  ON ingestion_log (symbol, exchange, timeframe, from_time, to_time);

CREATE TABLE IF NOT EXISTS training_runs (
  id              BIGSERIAL     PRIMARY KEY,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  model_version   TEXT          NOT NULL,
  samples_used    INTEGER,
  train_loss      DOUBLE PRECISION,
  val_loss        DOUBLE PRECISION,
  checkpoint_path TEXT,
  status          TEXT          NOT NULL DEFAULT 'RUNNING'
);

-- Optional TimescaleDB hypertable (ignore errors if extension unavailable):
-- SELECT create_hypertable('market_ohlcv', 'time', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
