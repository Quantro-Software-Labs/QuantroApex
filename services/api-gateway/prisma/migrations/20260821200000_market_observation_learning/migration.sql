-- AlterTable: enrich trade learning with provenance
CREATE TYPE "MarketDataSource" AS ENUM ('ALPACA', 'POLYGON', 'SIMULATED');

ALTER TABLE "trade_learning_data"
  ADD COLUMN "source" "MarketDataSource" NOT NULL DEFAULT 'SIMULATED',
  ADD COLUMN "is_simulated" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "observation_id" TEXT;

CREATE INDEX "trade_learning_data_source_created_at_idx" ON "trade_learning_data"("source", "created_at");
CREATE INDEX "trade_learning_data_user_id_symbol_created_at_idx" ON "trade_learning_data"("user_id", "symbol", "created_at");

-- CreateTable: background market observations for Global Brain training
CREATE TABLE "market_observations" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "asset_class" "AssetClass" NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "change_pct_24h" DECIMAL(12,4) NOT NULL,
    "volume" DECIMAL(24,2) NOT NULL,
    "technical_snapshot" JSONB NOT NULL,
    "market_context" JSONB NOT NULL,
    "source" "MarketDataSource" NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_observations_symbol_observed_at_idx" ON "market_observations"("symbol", "observed_at");
CREATE INDEX "market_observations_asset_class_observed_at_idx" ON "market_observations"("asset_class", "observed_at");
CREATE INDEX "market_observations_source_observed_at_idx" ON "market_observations"("source", "observed_at");

ALTER TABLE "trade_learning_data"
  ADD CONSTRAINT "trade_learning_data_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "market_observations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
