/**
 * Proxies historical backtests to the Python quant-engine (VectorBT).
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config/index.js';

export async function backtestRoutes(app: FastifyInstance) {
  app.post('/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      candles: z.array(
        z.object({
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number().optional(),
          timestamp: z.union([z.string(), z.number()]).optional(),
        }),
      ).min(30),
      strategy: z.object({
        type: z.enum(['sma_crossover', 'rsi', 'buy_hold']),
        params: z.record(z.unknown()).optional(),
      }),
      initial_cash: z.number().positive().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    try {
      const res = await fetch(`${config.quantEngine.baseUrl}/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      return reply.status(res.status).send(body);
    } catch {
      return reply.status(503).send({
        error: 'QuantEngineUnavailable',
        message: 'VectorBT backtest service is not reachable. Start services/quant-engine.',
      });
    }
  });
}
