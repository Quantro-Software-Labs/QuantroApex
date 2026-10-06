/**
 * Proxies candlestick pattern detection to the Python quant-engine (TA-Lib).
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config/index.js';

const candleSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

export async function patternsRoutes(app: FastifyInstance) {
  app.get('/list', async (_request, reply) => {
    try {
      const res = await fetch(`${config.quantEngine.baseUrl}/patterns/list`);
      const body = await res.json();
      return reply.status(res.status).send(body);
    } catch {
      return reply.status(503).send({
        error: 'QuantEngineUnavailable',
        message: 'TA-Lib pattern service is not reachable. Start services/quant-engine.',
      });
    }
  });

  app.post('/detect', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      candles: z.array(candleSchema).min(5),
      patterns: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
    }

    try {
      const res = await fetch(`${config.quantEngine.baseUrl}/patterns/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      return reply.status(res.status).send(body);
    } catch {
      return reply.status(503).send({
        error: 'QuantEngineUnavailable',
        message: 'TA-Lib pattern service is not reachable.',
      });
    }
  });
}
