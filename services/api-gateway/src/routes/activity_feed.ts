import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { getUserId } from '../plugins/auth.js';
import { eventBus } from '../lib/events/event_bus.js';
import { config } from '../config/index.js';
import { ensureAppUser } from '../lib/users/ensure_app_user.js';
import { initFirebaseAdmin } from '../plugins/firebase_auth.js';
import {
  findActiveUserStrategy,
  findAgentState,
  listActivityFeed,
} from '../lib/db/repos.js';

const querySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
});

async function resolveUserIdFromToken(token: string): Promise<string | null> {
  try {
    if (
      (config.isDev || process.env.NODE_ENV === 'test') &&
      token.startsWith('firebase_dev:')
    ) {
      const parts = token.split(':');
      const firebaseUid = parts[1] || '';
      const contact = parts[2] || 'dev@quantroapex.local';
      const isPhone = contact.startsWith('+');
      const user = await ensureAppUser({
        firebaseUid,
        email: isPhone ? undefined : contact,
        phone: isPhone ? contact : null,
      });
      return user.id;
    }

    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    const user = await ensureAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email,
      phone: decoded.phone_number ?? null,
      name: decoded.name,
    });
    return user.id;
  } catch {
    return null;
  }
}

export async function activityFeedRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = getUserId(request);
    const parsed = querySchema.safeParse(request.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;

    const [{ entries, total }, agentState, userStrategy] = await Promise.all([
      listActivityFeed(userId, { skip, take: limit }),
      findAgentState(userId),
      findActiveUserStrategy(userId),
    ]);

    return reply.send({
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      agentState: agentState || { phase: 'SEED', confidenceScore: 0.85, tradeCount: 0 },
      activeStrategy: userStrategy?.strategy || null,
    });
  });

  app.get('/ws/events', { websocket: true }, async (socket, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Authentication token required' }));
        socket.close();
        return;
      }
      const userId = await resolveUserIdFromToken(token);
      if (!userId) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid token' }));
        socket.close();
        return;
      }
      eventBus.registerClient(userId, socket);
      socket.send(JSON.stringify({ type: 'CONNECTED', message: 'Activity feed stream ready' }));
    } catch {
      socket.send(JSON.stringify({ type: 'ERROR', message: 'Authentication failed' }));
      socket.close();
    }
  });
}
