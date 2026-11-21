import { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/config', async (_request, reply) => {
    return reply.send({
      liveTradingEnabled: config.trading.liveTradingEnabled,
      environment: config.nodeEnv,
    });
  });
}
