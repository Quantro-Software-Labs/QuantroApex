import { PrismaClient, AssetClass, RiskLevel } from '@prisma/client';

const prisma = new PrismaClient();

const strategies = [
  {
    slug: 'strat-momentum-alpha',
    name: 'Apex Momentum Alpha',
    description: 'Identifies medium-term momentum accelerations in large-cap equities with dynamic stop-loss adjustments.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.GROWTH,
    style: 'Trend Following',
    activeUserCount: 1420,
    isPremium: false,
    rules: {
      entryCondition: '20-day SMA crosses above 50-day SMA with volume > 1.5x average',
      exitCondition: 'Trailing stop 4% or 20-day SMA cross below',
      maxPositions: 5,
    },
    backtestSummary: {
      winRate: 0.64,
      annualizedReturn: 0.284,
      maxDrawdown: 0.12,
      sharpeRatio: 2.1,
      totalTrades: 342,
    },
  },
  {
    slug: 'strat-conservative-yield',
    name: 'Conservative Yield & Trend',
    description: 'Focuses on low-volatility equities and capital preservation during market pullbacks.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.CONSERVATIVE,
    style: 'Defensive Capital',
    activeUserCount: 2150,
    isPremium: false,
    rules: {
      entryCondition: 'Low volatility index filter + dividend yield > 2.5%',
      exitCondition: 'Fixed 3% trailing stop',
      maxPositions: 10,
    },
    backtestSummary: {
      winRate: 0.72,
      annualizedReturn: 0.145,
      maxDrawdown: 0.05,
      sharpeRatio: 2.8,
      totalTrades: 198,
    },
  },
  {
    slug: 'strat-multi-asset-vol',
    name: 'Multi-Asset Volatility Capture',
    description: 'Captures intraday & multi-day mean reversions during heightened market volatility.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.AGGRESSIVE,
    style: 'Mean Reversion',
    activeUserCount: 890,
    isPremium: false,
    rules: {
      entryCondition: 'Bollinger Band 2.5 std outer band breach',
      exitCondition: 'Mean reversion to 20-period VWAP',
      maxPositions: 4,
    },
    backtestSummary: {
      winRate: 0.58,
      annualizedReturn: 0.362,
      maxDrawdown: 0.18,
      sharpeRatio: 1.85,
      totalTrades: 512,
    },
  },
  {
    slug: 'strat-crypto-bluechip',
    name: 'Crypto Bluechip Momentum',
    description: 'Systematically trades BTC and ETH momentum breaks with automated profit target scaling.',
    assetClass: AssetClass.CRYPTO,
    riskLevel: RiskLevel.GROWTH,
    style: 'Crypto Trend',
    activeUserCount: 1780,
    isPremium: false,
    rules: {
      entryCondition: '4-hour RSI > 60 + breakout above 7-day high',
      exitCondition: 'Dynamic ATR trailing stop',
      maxPositions: 2,
    },
    backtestSummary: {
      winRate: 0.61,
      annualizedReturn: 0.421,
      maxDrawdown: 0.19,
      sharpeRatio: 1.95,
      totalTrades: 420,
    },
  },
  {
    slug: 'strat-defensive-shield',
    name: 'Defensive Capital Shield',
    description: 'Employs strict trailing stops and minimal market exposure during choppy regimes.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.CONSERVATIVE,
    style: 'Capital Protection',
    activeUserCount: 3100,
    isPremium: false,
    rules: {
      entryCondition: 'Market regime score > 80% bullish context',
      exitCondition: '2% hard stop-loss',
      maxPositions: 8,
    },
    backtestSummary: {
      winRate: 0.76,
      annualizedReturn: 0.128,
      maxDrawdown: 0.04,
      sharpeRatio: 3.1,
      totalTrades: 145,
    },
  },
  {
    slug: 'strat-breakout-engine',
    name: 'Breakout Engine Pro',
    description: 'Enters high-conviction volume breakouts on key daily resistance levels.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.AGGRESSIVE,
    style: 'Breakout Trading',
    activeUserCount: 950,
    isPremium: false,
    rules: {
      entryCondition: 'Donchian channel 20-day high breakout + 2x volume',
      exitCondition: 'ATR multiplier stop',
      maxPositions: 3,
    },
    backtestSummary: {
      winRate: 0.52,
      annualizedReturn: 0.389,
      maxDrawdown: 0.22,
      sharpeRatio: 1.7,
      totalTrades: 610,
    },
  },
  {
    slug: 'strat-macro-trend',
    name: 'Macro Trend Follower',
    description: 'Follows multi-week macroeconomic trends in major currency pairs.',
    assetClass: AssetClass.FOREX,
    riskLevel: RiskLevel.GROWTH,
    style: 'Macro Trend',
    activeUserCount: 640,
    isPremium: false,
    rules: {
      entryCondition: 'Weekly EMA trend alignment + MACD cross',
      exitCondition: 'Weekly EMA cross back',
      maxPositions: 3,
    },
    backtestSummary: {
      winRate: 0.59,
      annualizedReturn: 0.215,
      maxDrawdown: 0.11,
      sharpeRatio: 2.25,
      totalTrades: 120,
    },
  },
  {
    slug: 'strat-crypto-vol-arb',
    name: 'Crypto Volatility Arbitrage',
    description: 'Exploits short-term pricing imbalances across major crypto spot markets.',
    assetClass: AssetClass.CRYPTO,
    riskLevel: RiskLevel.EXPERIMENTAL,
    style: 'Volatility Arbitrage',
    activeUserCount: 410,
    isPremium: true,
    rules: {
      entryCondition: 'Spread divergence > 0.8% between top exchanges',
      exitCondition: 'Spread convergence',
      maxPositions: 5,
    },
    backtestSummary: {
      winRate: 0.81,
      annualizedReturn: 0.495,
      maxDrawdown: 0.14,
      sharpeRatio: 2.7,
      totalTrades: 1280,
    },
  },
  {
    slug: 'strat-dividend-growth',
    name: 'Dividend Growth Momentum',
    description: 'Blends dividend yield stability with momentum filtering for consistent steady returns.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.CONSERVATIVE,
    style: 'Dividend Growth',
    activeUserCount: 1890,
    isPremium: false,
    rules: {
      entryCondition: '5-year dividend growth + 50-day SMA support',
      exitCondition: 'Dividend cut or 5% trailing stop',
      maxPositions: 10,
    },
    backtestSummary: {
      winRate: 0.74,
      annualizedReturn: 0.162,
      maxDrawdown: 0.06,
      sharpeRatio: 2.95,
      totalTrades: 210,
    },
  },
  {
    slug: 'strat-adaptive-ensemble',
    name: 'Apex Adaptive Neural Ensemble',
    description: 'Multi-factor AI ensemble combining regime detection, sentiment, and price action signals.',
    assetClass: AssetClass.STOCKS,
    riskLevel: RiskLevel.GROWTH,
    style: 'AI Ensemble',
    activeUserCount: 2450,
    isPremium: false,
    rules: {
      entryCondition: 'Ensemble model confidence > 82%',
      exitCondition: 'Model confidence < 45%',
      maxPositions: 6,
    },
    backtestSummary: {
      winRate: 0.68,
      annualizedReturn: 0.312,
      maxDrawdown: 0.10,
      sharpeRatio: 2.5,
      totalTrades: 480,
    },
  },
];

async function main() {
  console.log('Seeding strategies into PostgreSQL...');

  for (const strat of strategies) {
    await prisma.strategy.upsert({
      where: { slug: strat.slug },
      update: {
        name: strat.name,
        description: strat.description,
        assetClass: strat.assetClass,
        riskLevel: strat.riskLevel,
        style: strat.style,
        activeUserCount: strat.activeUserCount,
        isPremium: strat.isPremium,
        rules: strat.rules,
        backtestSummary: strat.backtestSummary,
      },
      create: strat,
    });
  }

  console.log(`Successfully seeded ${strategies.length} strategies.`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
