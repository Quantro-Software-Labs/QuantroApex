import { FastifyInstance } from 'fastify';
import { tradeLearningLogger } from '../lib/ai/trade_learning_logger.js';
import { getUserId } from '../plugins/firebase_auth.js';

export async function learningRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/stats', async (request, reply) => {
    const userId = request.user?.id ?? request.user?.sub ?? getUserId(request);
    const userStats = await tradeLearningLogger.getLearningStats(userId);
    const globalStats = await tradeLearningLogger.getLearningStats();

    return reply.send({
      user: userStats,
      global: globalStats,
      timestamp: new Date().toISOString(),
    });
  });
}
