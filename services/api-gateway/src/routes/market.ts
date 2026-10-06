import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { findUserProfile } from '../lib/db/repos.js';
import { getUserId } from '../plugins/auth.js';
import {
  computeMarketSentiment,
  computeTechnicals,
  resolveAssetDetail,
  resolveLiveQuotes,
  resolveTickerQuotes,
  summarizeQuoteSources,
} from '../lib/market/quote_engine.js';
import { findAsset } from '../lib/market/market_directory.js';

const aiStudySchema = z.object({
  symbol: z.string().min(1).max(15),
});

async function getUserAlpacaKeys(userId: string) {
  const profile = await findUserProfile(userId);
  if (profile?.isBrokerConnected && profile.alpacaApiKey && profile.alpacaSecretKey) {
    return { apiKey: profile.alpacaApiKey, apiSecret: profile.alpacaSecretKey };
  }
  return {};
}

export async function marketRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/stocks', async (request, reply) => {
    const { assetClass } = request.query as { assetClass?: string };
    const userId = getUserId(request);
    const alpacaKeys = await getUserAlpacaKeys(userId);

    const stocks = await resolveLiveQuotes({
      ...alpacaKeys,
      assetClass,
    });
    const sources = summarizeQuoteSources(stocks);

    return reply.send({
      stocks,
      totalCount: stocks.length,
      timestamp: new Date().toISOString(),
      liveData: sources.liveData,
      partialLive: sources.partialLive,
      liveCount: sources.liveCount,
      simulatedCount: sources.simulatedCount,
    });
  });

  app.get('/ticker', async (request, reply) => {
    const userId = getUserId(request);
    const alpacaKeys = await getUserAlpacaKeys(userId);
    const ticker = await resolveTickerQuotes(alpacaKeys);

    return reply.send({
      ticker,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/sentiment', async (request, reply) => {
    const userId = getUserId(request);
    const alpacaKeys = await getUserAlpacaKeys(userId);
    const quotes = await resolveLiveQuotes(alpacaKeys);
    const sentiment = computeMarketSentiment(quotes);

    return reply.send({
      sentiment,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/stocks/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const decodedSymbol = decodeURIComponent(symbol).toUpperCase();

    if (!findAsset(decodedSymbol)) {
      return reply.status(404).send({
        error: 'NotFoundError',
        message: `Asset symbol ${decodedSymbol} not found.`,
      });
    }

    const userId = getUserId(request);
    const alpacaKeys = await getUserAlpacaKeys(userId);
    const detail = await resolveAssetDetail(decodedSymbol, alpacaKeys);

    if (!detail) {
      return reply.status(404).send({
        error: 'NotFoundError',
        message: `Asset symbol ${decodedSymbol} not found.`,
      });
    }

    const technicals = computeTechnicals(detail.stock, detail.candles);

    return reply.send({
      stock: detail.stock,
      technicals,
      candles: detail.candles,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/ai-study', async (request, reply) => {
    const parsed = aiStudySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const symbol = parsed.data.symbol.toUpperCase();
    const userId = getUserId(request);
    const alpacaKeys = await getUserAlpacaKeys(userId);
    const quotes = await resolveLiveQuotes(alpacaKeys);
    const stock = quotes.find((s) => s.symbol.toUpperCase() === symbol) ?? findAsset(symbol) ?? {
      symbol,
      name: `${symbol} Asset`,
      price: 150.0,
      change24h: 0,
      changePct24h: 1.2,
      high24h: 155,
      low24h: 145,
      volume: 0,
      marketCap: 'N/A',
      sector: 'General Market',
      assetClass: 'STOCKS' as const,
    };

    let studyText = '';
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (apiKey && process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are Apex, an AI Quantitative Analyst at Quantro Software Labs.
Provide a concise 3-sentence technical and fundamental study for asset: ${symbol} (${stock.name}, ${stock.assetClass}).
Current Price: ${stock.price}, 24h Change: ${stock.changePct24h}%.
Style requirements:
- Sentence 1: Key trend, momentum, and technical breakout/support levels.
- Sentence 2: Core fundamental or macro driver for this ${stock.assetClass} asset.
- Sentence 3: Concise AI recommendation (e.g. Accumulate on dips, Hold, Bullish momentum breakout). Keep under 300 characters total.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        studyText = response.text?.trim() ?? '';
      } catch (err) {
        console.warn('Gemini AI study call failed, using fallback study:', err);
      }
    }

    if (!studyText) {
      studyText = `Apex Study: ${symbol} (${stock.assetClass}) displays ${stock.changePct24h >= 0 ? 'positive' : 'mixed'} momentum with price at ${stock.price}. Sector context: ${stock.sector}. Recommendation: ${stock.changePct24h >= 0 ? 'Strategic entry on minor pullbacks' : 'Hold and monitor support levels'}.`;
    }

    return reply.send({
      symbol,
      name: stock.name,
      price: stock.price,
      studyText,
      recommendation: stock.changePct24h >= 0 ? 'ACCUMULATE' : 'HOLD_DIP',
      confidenceScore: 0.88,
      timestamp: new Date().toISOString(),
    });
  });
}
