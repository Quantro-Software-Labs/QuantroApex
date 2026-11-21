import { FastifyInstance } from 'fastify';
import { pingDatabase } from '../lib/db/repos.js';
import { eventBus } from '../lib/events/event_bus.js';
import { defaultBrokerClient } from '../lib/broker/alpaca_client.js';
import { config } from '../config/index.js';
import { AlpacaMarketDataClient } from '../lib/market/alpaca_market_data.js';
import { PolygonClient } from '../lib/market/polygon_client.js';
import { getObserverStatus } from '../lib/market/market_observer.js';

function alpacaMarketDataStatus(): 'CONNECTED' | 'MISSING_KEY' | 'ERROR' {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return config.alpaca.apiKey && config.alpaca.apiSecret ? 'CONNECTED' : 'MISSING_KEY';
  }
  const client = new AlpacaMarketDataClient();
  // isConfigured is private — mirror its logic
  if (!(config.alpaca.apiKey && config.alpaca.apiSecret)) return 'MISSING_KEY';
  try {
    // Lightweight: keys present counts as CONNECTED; live probe is expensive for health
    void client;
    return 'CONNECTED';
  } catch {
    return 'ERROR';
  }
}

function polygonStatus(): 'CONNECTED' | 'MISSING_KEY' | 'ERROR' {
  const client = new PolygonClient();
  if (!client.isConfigured()) return 'MISSING_KEY';
  return 'CONNECTED';
}

export async function healthRoutes(app: FastifyInstance) {
  // Liveness probe — fast check for container orchestrators (Kubernetes/Docker)
  app.get('/health', async () => {
    const alpaca = !!(config.marketData.alpacaKey && config.marketData.alpacaSecret);
    const ccxt = !!(config.marketData.cryptoExchange);
    const polygon = !!(config.polygon.apiKey);

    return {
      status: 'ok',
      service: 'quantroapex-api-gateway',
      marketDataProviders: {
        alpaca: alpaca ? 'LIVE' : 'UNCONFIGURED',
        ccxt: ccxt ? 'LIVE' : 'UNCONFIGURED',
        polygon: polygon ? 'LIVE' : 'UNCONFIGURED',
      },
      timestamp: new Date().toISOString(),
    };
  });

  /** Public privacy policy HTML for store review (also host at apex.quantrolabs.app/privacy). */
  app.get('/legal/privacy', async (_request, reply) => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    try {
      const html = readFileSync(
        resolve(process.cwd(), '../../docs/legal/privacy.html'),
        'utf8',
      );
      return reply.type('text/html').send(html);
    } catch {
      return reply.redirect(process.env.PRIVACY_POLICY_URL || 'https://apex.quantrolabs.app/privacy');
    }
  });

  app.get('/health/live', async () => ({
    status: 'ALIVE',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  // Readiness probe — checks if database and core services are connected
  app.get('/health/ready', async (_request, reply) => {
    try {
      const ok = await pingDatabase();
      if (!ok) throw new Error('Database ping failed');
      return reply.send({
        status: 'READY',
        database: 'CONNECTED',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(503).send({
        status: 'NOT_READY',
        database: 'DISCONNECTED',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Detailed subsystem breakdown for ops & admin dashboards
  app.get('/health/detailed', async (_request, reply) => {
    let dbStatus = 'HEALTHY';
    let dbLatencyMs = 0;

    const startDb = Date.now();
    try {
      const ok = await pingDatabase();
      dbLatencyMs = Date.now() - startDb;
      if (!ok) dbStatus = 'UNHEALTHY';
    } catch {
      dbStatus = 'UNHEALTHY';
    }

    let brokerStatus = 'DISCONNECTED';
    try {
      const brokerAcc = await defaultBrokerClient.getAccount();
      if (brokerAcc.id === 'mock_paper_account') {
        brokerStatus = process.env.NODE_ENV === 'test' ? 'CONNECTED_SANDBOX' : 'DEGRADED';
      } else {
        brokerStatus = 'CONNECTED_SANDBOX';
      }
    } catch {
      brokerStatus = 'DEGRADED';
    }

    const memory = process.memoryUsage();
    const observer = getObserverStatus();

    const alpacaLive = !!(config.marketData.alpacaKey && config.marketData.alpacaSecret);
    const ccxtLive = !!(config.marketData.cryptoExchange);
    const polygonLive = !!(config.polygon.apiKey);

    const isHealthy = dbStatus === 'HEALTHY' && brokerStatus !== 'ERROR';

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy && brokerStatus !== 'DEGRADED' ? 'HEALTHY' : 'DEGRADED',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      subsystems: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
        broker: { status: brokerStatus },
        marketDataProviders: {
          alpaca: alpacaLive ? 'LIVE' : 'UNCONFIGURED',
          ccxt: ccxtLive ? 'LIVE' : 'UNCONFIGURED',
          polygon: polygonLive ? 'LIVE' : 'UNCONFIGURED',
        },
        alpacaMarketData: { status: alpacaMarketDataStatus() },
        polygon: { status: polygonStatus() },
        marketObserver: {
          running: observer.running,
          lastRunAt: observer.lastRunAt,
          lastObservationCount: observer.lastObservationCount,
          lastError: observer.lastError,
        },
        eventBus: { activeConnections: eventBus.connectionCount },
      },
      memoryUsage: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      timestamp: new Date().toISOString(),
    });
  });
}
