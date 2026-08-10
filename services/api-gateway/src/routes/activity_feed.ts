import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUserId, JwtPayload } from '../plugins/auth.js';
import { eventBus } from '../lib/events/event_bus.js';

const querySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
});

export async function activityFeedRoutes(app: FastifyInstance) {
  // REST Endpoint
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = getUserId(request);
    const parsed = querySchema.safeParse(request.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;

    const [entries, total, agentState, userStrategy] = await Promise.all([
      prisma.activityFeedEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activityFeedEntry.count({ where: { userId } }),
      prisma.agentState.findUnique({ where: { userId } }),
      prisma.userStrategy.findFirst({
        where: { userId, isActive: true },
        include: { strategy: true },
      }),
    ]);

    return reply.send({
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      agentState: agentState || {
        phase: 'SEED',
        confidenceScore: 0.85,
        tradeCount: 0,
      },
      activeStrategy: userStrategy?.strategy || null,
    });
  });

  // WebSocket Streaming Endpoint
  // Note: Token is passed via query string for WS compatibility.
  // Access logs should be configured to exclude/mask the token parameter in production.
  app.get('/ws/events', { websocket: true }, (socket, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Authentication token required' }));
        socket.close();
        return;
      }

      // Use correct JWT payload field: sub (not userId)
      const decoded = app.jwt.verify<JwtPayload>(token);
      const userId = decoded.sub;

      if (!userId) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid token payload' }));
        socket.close();
        return;
      }

      // Register connection in EventBus
      eventBus.registerClient(userId, socket);

      socket.send(
        JSON.stringify({
          type: 'CONNECTED',
          data: { message: 'QuantroApex real-time stream connected' },
          timestamp: new Date().toISOString(),
        }),
      );
    } catch {
      socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid or expired token' }));
      socket.close();
    }
  });
}
