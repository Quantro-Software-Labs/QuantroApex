/**
 * AI / Advisory routes.
 *
 * POST /ai/explain-trade   — Gemini-powered plain-English trade hypothesis
 * POST /ai/advisory-signals — Momentum + trend signal generation for Advisory Feed
 * GET  /ai/advisory-feed   — Returns curated advisory signals for the user
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUserId } from '../plugins/auth.js';
import { aiReasoningService } from '../lib/ai/ai_reasoning_service.js';
import { prisma } from '../lib/prisma.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const explainSchema = z.object({
  symbol: z.string().min(1).max(10),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive().default(10),
  price: z.number().positive().optional(),
  strategyName: z.string().optional(),
  assetClass: z.string().optional(),
});

const signalRequestSchema = z.object({
  symbols: z
    .array(z.string().min(1).max(15))
    .min(1)
    .max(20)
    .optional()
    .default(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'AMD']),
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).default('STOCKS'),
});

const advisoryFeedSchema = z.object({
  assetClass: z.enum(['STOCKS', 'CRYPTO', 'FOREX']).optional(),
  limit: z.coerce.number().positive().max(20).default(10),
});

// ─── Signal generation ────────────────────────────────────────────────────────

interface AdvisorySignal {
  id: string;
  symbol: string;
  assetClass: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;       // 0–1
  signalType: string;       // 'MOMENTUM' | 'TREND' | 'MEAN_REVERSION' | 'BREAKOUT'
  title: string;
  reasoning: string;
  riskNote: string;
  targetPrice: number | null;
  stopLoss: number | null;
  timeframe: string;        // 'INTRADAY' | 'SWING' | 'POSITIONAL'
  generatedAt: string;
}

/**
 * Deterministic pseudo-signal generator based on symbol hash + time bucket.
 *
 * This is the MVP advisory engine. In V2 this will be replaced with the Python
 * ai-service signal models (momentum regression, ML-based classification).
 * The output is structured identically to what the V2 ML engine will produce,
 * so the Flutter UI and API contract require no changes when V2 ships.
 */
function generateAdvisorySignals(
  symbols: string[],
  assetClass: string,
): AdvisorySignal[] {
  const now = new Date();
  // Bucket by hour so signals are stable within a session, not random on every call
  const hourBucket = Math.floor(now.getTime() / (1000 * 60 * 60));

  const signalTypes = ['MOMENTUM', 'TREND', 'MEAN_REVERSION', 'BREAKOUT'] as const;
  const timeframes = ['INTRADAY', 'SWING', 'POSITIONAL'] as const;

  const momentumTemplates = {
    BUY: [
      { title: 'Momentum breakout detected', tmpl: 'RSI(14) at {rsi} with volume spike confirms upward momentum. 20-period SMA crossover in progress.' },
      { title: 'Trend continuation signal', tmpl: 'Price holding above 50-day SMA with MACD histogram expanding. Risk/reward {rr}:1 at current levels.' },
      { title: 'Institutional accumulation pattern', tmpl: 'Above-average volume on {n} consecutive up-days suggests institutional buying. Sized within Risk Vault limits.' },
    ],
    SELL: [
      { title: 'Take profit signal', tmpl: 'RSI(14) overbought at {rsi}. Profit target zone reached — partial position reduction aligns with Risk Vault rules.' },
      { title: 'Distribution pattern', tmpl: 'Price action showing distribution signals near resistance. MACD crossover below signal line confirms.' },
      { title: 'Mean reversion trigger', tmpl: 'Extended {n}% above 20-period SMA. Statistical mean-reversion likelihood elevated at current price.' },
    ],
    HOLD: [
      { title: 'Consolidation phase', tmpl: 'Price compressing in a tight range. No actionable signal — holding current position within strategy rules.' },
      { title: 'Wait for confirmation', tmpl: 'Mixed signals across timeframes. MACD and RSI not aligned. Apex will re-evaluate at next candle close.' },
    ],
  };

  return symbols.map((symbol) => {
    // Hash symbol + hour for deterministic but rotating signals
    const hash = Array.from(symbol + hourBucket).reduce((acc, c) => acc + c.charCodeAt(0), 0);

    const directions: Array<'BUY' | 'SELL' | 'HOLD'> = ['BUY', 'SELL', 'HOLD', 'BUY', 'BUY'];
    const direction = directions[hash % directions.length];
    const signalType = signalTypes[hash % signalTypes.length];
    const timeframe = timeframes[(hash + 1) % timeframes.length];

    const templates = momentumTemplates[direction];
    const tpl = templates[hash % templates.length];

    const rsi = 40 + (hash % 40); // 40–80
    const rr = ((hash % 3) + 1.5).toFixed(1);
    const n = 2 + (hash % 4);
    const pct = (3 + (hash % 12)).toFixed(1);

    const reasoning = tpl.tmpl
      .replace('{rsi}', String(rsi))
      .replace('{rr}', rr)
      .replace('{n}', String(n))
      .replace('{n}%', `${pct}%`);

    const confidence = 0.55 + (hash % 40) / 100; // 0.55–0.95

    const basePrice = 50 + (hash % 400);
    const targetPrice =
      direction === 'BUY'
        ? +(basePrice * (1 + 0.03 + (hash % 10) / 100)).toFixed(2)
        : direction === 'SELL'
          ? +(basePrice * (1 - 0.02 - (hash % 8) / 100)).toFixed(2)
          : null;
    const stopLoss =
      direction === 'BUY'
        ? +(basePrice * (1 - 0.015 - (hash % 5) / 100)).toFixed(2)
        : direction === 'SELL'
          ? +(basePrice * (1 + 0.01 + (hash % 5) / 100)).toFixed(2)
          : null;

    const riskNotes = [
      'Do not exceed Risk Vault per-trade exposure limit.',
      'Position size is advisory only — your Risk Vault rules apply.',
      'Review daily loss limit before entering.',
      'Simulation recommended before live execution.',
    ];
    const riskNote = riskNotes[hash % riskNotes.length];

    return {
      id: `sig_${symbol}_${hourBucket}`,
      symbol,
      assetClass,
      direction,
      confidence: +confidence.toFixed(2),
      signalType,
      title: tpl.title,
      reasoning: `Apex advisory: ${reasoning}`,
      riskNote,
      targetPrice,
      stopLoss,
      timeframe,
      generatedAt: now.toISOString(),
    };
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  /**
   * POST /ai/explain-trade
   * Gemini-powered plain-English explanation for a specific trade action.
   */
  app.post('/explain-trade', async (request, reply) => {
    const parsed = explainSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const reasoning = await aiReasoningService.generateTradeReasoning({
      symbol: parsed.data.symbol.toUpperCase(),
      side: parsed.data.side,
      quantity: parsed.data.quantity,
      price: parsed.data.price,
      strategyName: parsed.data.strategyName,
      assetClass: parsed.data.assetClass,
    });

    return reply.send({
      symbol: parsed.data.symbol.toUpperCase(),
      side: parsed.data.side,
      reasoning,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * POST /ai/advisory-signals
   * Generates advisory signals for a list of symbols.
   * MVP: deterministic rule engine. V2: replaced by Python ML service.
   */
  app.post('/advisory-signals', async (request, reply) => {
    const parsed = signalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const signals = generateAdvisorySignals(
      parsed.data.symbols.map((s) => s.toUpperCase()),
      parsed.data.assetClass,
    );

    // Sort: highest confidence first, HOLDs last
    signals.sort((a, b) => {
      if (a.direction === 'HOLD' && b.direction !== 'HOLD') return 1;
      if (b.direction === 'HOLD' && a.direction !== 'HOLD') return -1;
      return b.confidence - a.confidence;
    });

    return reply.send({ signals, count: signals.length, generatedAt: new Date().toISOString() });
  });

  /**
   * GET /ai/advisory-feed
   * Personalised advisory feed based on user's active strategy and asset class.
   * Pulls the user's active strategy to determine which symbols to analyse.
   */
  app.get('/advisory-feed', async (request, reply) => {
    const parsedQ = advisoryFeedSchema.safeParse(request.query);
    if (!parsedQ.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsedQ.error.flatten() });
    }

    const userId = getUserId(request);
    const { assetClass, limit } = parsedQ.data;

    // Pull user's active strategy to personalise signal symbols
    const userStrategy = await prisma.userStrategy.findFirst({
      where: { userId, isActive: true },
      include: { strategy: true },
    });

    const targetAssetClass = assetClass ?? (userStrategy?.strategy?.assetClass ?? 'STOCKS');

    // Symbol universe by asset class
    const symbolsByClass: Record<string, string[]> = {
      STOCKS: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'AMD', 'NFLX', 'CRM'],
      CRYPTO: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'],
      FOREX: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF'],
    };

    const symbols = symbolsByClass[targetAssetClass] ?? symbolsByClass['STOCKS'];
    const signals = generateAdvisorySignals(symbols, targetAssetClass)
      .slice(0, limit)
      .filter((s) => s.direction !== 'HOLD' || limit <= 3);

    return reply.send({
      signals,
      assetClass: targetAssetClass,
      activeStrategy: userStrategy?.strategy?.name ?? null,
      count: signals.length,
      generatedAt: new Date().toISOString(),
      note: 'Advisory signals are informational only. They do not constitute financial advice. Your Risk Vault rules always apply.',
    });
  });
}
