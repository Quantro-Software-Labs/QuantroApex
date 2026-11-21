-- CreateTable
CREATE TABLE IF NOT EXISTS "trade_learning_data" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "asset_class" "AssetClass" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "realized_pnl" DECIMAL(18,2),
    "is_win" BOOLEAN,
    "technical_snapshot" JSONB,
    "market_context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_learning_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trade_learning_data_user_id_created_at_idx" ON "trade_learning_data"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trade_learning_data_asset_class_is_win_idx" ON "trade_learning_data"("asset_class", "is_win");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'trade_learning_data_user_id_fkey'
    ) THEN
        ALTER TABLE "trade_learning_data" ADD CONSTRAINT "trade_learning_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
