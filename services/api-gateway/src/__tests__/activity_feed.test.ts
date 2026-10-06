import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { eventBus } from '../lib/events/event_bus.js';
import { FastifyInstance } from 'fastify';
import { registerTestUser } from './helpers/firebase_auth.js';

describe('Activity Feed & EventBus Integration', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@feedtest.com' } },
    });

    const session = await registerTestUser(app, 'trader@feedtest.com');
    accessToken = session.accessToken;
    userId = session.user.id;
  });

  it('should fetch activity feed with agent state and strategy', async () => {
    // Generate an activity log via execution
    await app.inject({
      method: 'POST',
      url: '/execution/order',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        limitPrice: 150,
        assetClass: 'STOCKS',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/activity-feed',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.agentState).toBeDefined();
    expect(body.entries[0].message).toContain('AAPL');
  });

  it('should verify eventBus broadcasts without throwing errors', () => {
    expect(() => {
      eventBus.broadcastToUser(userId, 'TEST_EVENT', { ping: 'pong' });
      eventBus.broadcastAll('GLOBAL_EVENT', { status: 'OK' });
    }).not.toThrow();
  });
});
