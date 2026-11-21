-- CreateEnum
CREATE TYPE "LimitUnit" AS ENUM ('PERCENT', 'USD');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- AlterTable
ALTER TABLE "risk_vaults" ADD COLUMN IF NOT EXISTS "daily_loss_limit_unit" "LimitUnit" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "risk_vaults" ADD COLUMN IF NOT EXISTS "max_drawdown_unit" "LimitUnit" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "risk_vaults" ADD COLUMN IF NOT EXISTS "per_trade_exposure_unit" "LimitUnit" NOT NULL DEFAULT 'PERCENT';

-- Backfill existing risk_vaults
UPDATE "risk_vaults" SET "daily_loss_limit_unit" = 'USD' WHERE "daily_loss_limit" > 1.0;
UPDATE "risk_vaults" SET "daily_loss_limit_unit" = 'PERCENT' WHERE "daily_loss_limit" <= 1.0;
UPDATE "risk_vaults" SET "max_drawdown_unit" = 'PERCENT';
UPDATE "risk_vaults" SET "per_trade_exposure_unit" = 'PERCENT';

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "time_in_force" TEXT NOT NULL DEFAULT 'DAY';

-- CreateTable payment_transactions
CREATE TABLE IF NOT EXISTS "payment_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "channel" TEXT NOT NULL DEFAULT 'paystack',
    "status" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_reference_key" ON "payment_transactions"("reference");
CREATE INDEX IF NOT EXISTS "payment_transactions_user_id_idx" ON "payment_transactions"("user_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_user_id_fkey') THEN
    ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable equity_snapshots
CREATE TABLE IF NOT EXISTS "equity_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "mode" "PortfolioMode" NOT NULL DEFAULT 'SIM',
    "equity" DECIMAL(18,2) NOT NULL,
    "cash_balance" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "equity_snapshots_portfolio_id_created_at_idx" ON "equity_snapshots"("portfolio_id", "created_at");
CREATE INDEX IF NOT EXISTS "equity_snapshots_user_id_created_at_idx" ON "equity_snapshots"("user_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equity_snapshots_user_id_fkey') THEN
    ALTER TABLE "equity_snapshots" ADD CONSTRAINT "equity_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equity_snapshots_portfolio_id_fkey') THEN
    ALTER TABLE "equity_snapshots" ADD CONSTRAINT "equity_snapshots_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
