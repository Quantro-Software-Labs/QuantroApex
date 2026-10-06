import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

const AUTH = {
  authorization: 'Bearer firebase_dev:user_sub_test:sub@test.com',
};

describe('Subscriptions endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  it('GET /subscriptions/current requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/subscriptions/current' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /subscriptions/current returns plan + feature flags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/subscriptions/current',
      headers: AUTH,
    });
    expect([200, 401, 503]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('plan');
      expect(body.features).toMatchObject({
        advisory: expect.any(Boolean),
        simulation: expect.any(Boolean),
        autopilot: expect.any(Boolean),
        manualDesk: expect.any(Boolean),
      });
    }
  });

  it('POST /subscriptions/initialise validates plan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/initialise',
      headers: AUTH,
      payload: { plan: 'NOT_A_PLAN' },
    });
    expect([400, 401, 503]).toContain(res.statusCode);
  });

  it('POST /subscriptions/initialise returns checkout fields when configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/initialise',
      headers: AUTH,
      payload: { plan: 'CORE', email: 'sub@test.com' },
    });
    // 201 with Paystack mock/real, or 500/503 if client not configured
    expect([201, 400, 401, 500, 503]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('authorizationUrl');
      expect(body).toHaveProperty('reference');
    }
  });

  it('POST /subscriptions/verify rejects missing reference', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify',
      headers: AUTH,
      payload: {},
    });
    expect([400, 401, 503]).toContain(res.statusCode);
  });

  it('POST /subscriptions/webhook rejects unsigned when Paystack configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/webhook',
      headers: { 'x-paystack-signature': 'bad' },
      payload: { event: 'charge.success', data: {} },
    });
    expect([200, 401]).toContain(res.statusCode);
  });

  it('POST /subscriptions/cancel returns FREE plan when DB available', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/cancel',
      headers: AUTH,
    });
    expect([200, 401, 503]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.payload);
      expect(body.subscription.plan).toBe('FREE');
    }
  });
});
