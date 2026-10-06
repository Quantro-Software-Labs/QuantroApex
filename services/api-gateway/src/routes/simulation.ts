import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findUserProfile,
  findPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePositionsForPortfolio,
  deleteSimulatedOrders,
  findActiveUserStrategy,
  upsertAgentState,
  createActivityEntry,
} from '../lib/db/repos.js';
import { getUserId } from '../plugins/auth.js';
import { executeOrder, syncUserPendingOrders } from '../lib/execution_engine.js';
import { AlpacaClient } from '../lib/broker/alpaca_client.js';

const toggleModeSchema = z.object({
  mode: z.enum(['SIM', 'LIVE']),
});

const generateTicksSchema = z.object({
  symbol: z.string().optional(),
  volatility: z.number().min(0.001).max(0.1).default(0.02),
});

export async function simulationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/summary', async (request, reply) => {
    const userId = getUserId(request);
    await syncUserPendingOrders(userId);

    const profile = await findUserProfile(userId);

    let simPortfolio = await findPortfolio(userId, 'SIM');

    if (!simPortfolio) {
      simPortfolio = await createPortfolio({
        userId,
        mode: 'SIM',
        cashBalance: 100000,
        equity: 100000,
      });
    }

    let livePortfolioData = null;
    let isBrokerConnected = false;

    if (profile?.isBrokerConnected && profile.alpacaApiKey && profile.alpacaSecretKey) {
      try {
        const client = new AlpacaClient({
          apiKey: profile.alpacaApiKey,
          apiSecret: profile.alpacaSecretKey,
        });
        const [account, positions] = await Promise.all([
          client.getAccount(),
          client.getPositions(),
        ]);

        const mappedPositions = positions.map((p, idx) => ({
          id: `alpaca_${p.symbol}_${idx}`,
          symbol: p.symbol,
          quantity: p.qty,
          averageCost: p.avgEntryPrice,
          marketValue: p.marketValue,
        }));

        isBrokerConnected = true;
        livePortfolioData = {
          id: account.id,
          cashBalance: account.cash,
          equity: account.portfolioValue,
          positionsCount: positions.length,
          positions: mappedPositions,
        };
      } catch (err) {
        // Fallback if Alpaca API query fails
      }
    }

    const activeUserStrategy = await findActiveUserStrategy(userId);

    const simCash = simPortfolio.cashBalance;
    let simPositionValue = 0;
    (simPortfolio.positions ?? []).forEach((pos) => {
      simPositionValue += pos.quantity * pos.averageCost;
    });
    const totalSimEquity = simCash + simPositionValue;
    const simPnl = totalSimEquity - 100000;

    return reply.send({
      activeMode: isBrokerConnected ? 'LIVE' : 'SIM',
      simPortfolio: livePortfolioData || {
        id: simPortfolio.id,
        cashBalance: simCash,
        equity: totalSimEquity,
        realizedPnl: simPnl,
        positionsCount: (simPortfolio.positions ?? []).length,
        positions: simPortfolio.positions ?? [],
      },
      livePortfolio: livePortfolioData,
      activeStrategy: activeUserStrategy?.strategy || null,
      isBrokerConnected,
    });
  });

  app.post('/toggle-mode', async (request, reply) => {
    const parsed = toggleModeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    const userId = getUserId(request);
    const { mode } = parsed.data;

    // Persist mode preference and log the switch to the activity feed
    await upsertAgentState(userId, { isRunning: false });
    await createActivityEntry({
      userId,
      eventType: 'SYSTEM',
      message: `Execution mode switched to ${mode}. Agent paused for safety — resume when ready.`,
    });

    return reply.send({
      message: `Switched active execution mode to ${mode}`,
      mode,
      agentPaused: true,
    });
  });

const resetSchema = z.object({
  startingCapital: z.number().min(100).max(10000000).optional(),
});

  app.post('/reset', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = resetSchema.safeParse(request.body || {});
    const startingCapital = (parsed.success && parsed.data.startingCapital) ? parsed.data.startingCapital : 100000;

    const simPortfolio = await findPortfolio(userId, 'SIM');

    if (simPortfolio) {
      await deletePositionsForPortfolio(simPortfolio.id);
      await deleteSimulatedOrders(userId);
      await updatePortfolio(simPortfolio.id, {
        cashBalance: startingCapital,
        equity: startingCapital,
      });
      await createActivityEntry({
        userId,
        eventType: 'SYSTEM',
        message: `Paper trading account reset to \$${startingCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })} initial capital.`,
      });
    } else {
      await createPortfolio({
        userId,
        mode: 'SIM',
        cashBalance: startingCapital,
        equity: startingCapital,
      });
    }

    return reply.send({
      message: `Paper trading account reset to \$${startingCapital.toLocaleString()} successfully`,
      cashBalance: startingCapital,
      equity: startingCapital,
      positions: [],
    });
  });

  app.post('/generate-ticks', async (request, reply) => {
    const parsed = generateTicksSchema.safeParse(request.body);
    const userId = getUserId(request);
    const symbol = (parsed.success && parsed.data.symbol) ? parsed.data.symbol.toUpperCase() : 'AAPL';

    const simPortfolio = await findPortfolio(userId, 'SIM');

    // Simulate price fluctuation (-2% to +3%)
    const changeFactor = 1 + (Math.random() * 0.05 - 0.02);
    const currentPos = simPortfolio?.positions?.find((p) => p.symbol === symbol);
    // Prefer live quote as base when no open position
    const { resolveQuotePrice } = await import('../lib/market/quote_engine.js');
    const { findAsset } = await import('../lib/market/market_directory.js');
    const live = await resolveQuotePrice(symbol);
    const basePrice = currentPos
      ? currentPos.averageCost
      : live?.price || findAsset(symbol)?.price || 100.0;
    const newPrice = Number((basePrice * changeFactor).toFixed(2));

    // Execute simulated trade if change is positive
    let autoTrade = null;
    if (changeFactor > 1.01) {
      const result = await executeOrder({
        userId,
        symbol,
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 5,
        limitPrice: newPrice,
        assetClass: 'STOCKS',
        aiReasoning: `Simulated tick breakout signal on ${symbol} @ \$${newPrice}`,
        isSimulated: true,
      });

      if (result.success) {
        autoTrade = result.trade;
      }
    }

    return reply.send({
      message: 'Simulated market tick generated',
      tick: {
        symbol,
        price: newPrice,
        changeFactor: parseFloat(changeFactor.toFixed(4)),
      },
      tradeExecuted: !!autoTrade,
      trade: autoTrade,
    });
  });
}
