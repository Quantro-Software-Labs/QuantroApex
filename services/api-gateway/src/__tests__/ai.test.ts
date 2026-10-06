import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';
import { aiReasoningService } from '../lib/ai/ai_reasoning_service.js';
import { registerTestUser } from './helpers/firebase_auth.js';

describe('AI Reasoning & Gemini Engine', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const session = await registerTestUser(app);
    authToken = session.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should generate trade reasoning via AiReasoningService', async () => {
    const reasoning = await aiReasoningService.generateTradeReasoning({
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 12,
      price: 182.4,
      strategyName: 'Apex Momentum Alpha',
    });

    expect(reasoning).toBeDefined();
    expect(reasoning).toContain('Apex reasoning:');
    expect(typeof reasoning).toBe('string');
  });

  it('should request AI trade explanation via POST /ai/explain-trade endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/explain-trade',
      headers: { Authorization: `Bearer ${authToken}` },
      payload: {
        symbol: 'MSFT',
        side: 'BUY',
        quantity: 15,
        price: 410.5,
        strategyName: 'Tech Sector Surge',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.symbol).toBe('MSFT');
    expect(json.side).toBe('BUY');
    expect(json.reasoning).toContain('Apex reasoning:');
  });
});
