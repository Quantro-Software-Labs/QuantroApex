import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('Notifications & Advisory Mode Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@notificationtest.com' } },
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'trader@notificationtest.com',
        password: 'Password123!',
      },
    });

    const body = JSON.parse(regRes.payload);
    accessToken = body.accessToken;
  });

  it('should fetch and update notification preferences', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/notifications/preferences',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.preferences.tradeAlerts).toBe(true);

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/notifications/preferences',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        tradeAlerts: true,
        riskAlerts: false,
        digestFrequency: 'WEEKLY',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.payload);
    expect(updateBody.preferences.riskAlerts).toBe(false);
    expect(updateBody.preferences.digestFrequency).toBe('WEEKLY');
  });

  it('should register FCM device token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/notifications/fcm-token',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        fcmToken: 'mock_fcm_token_xyz123',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.fcmToken).toBe('mock_fcm_token_xyz123');
  });

  it('should fetch advisory signal feed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/notifications/advisory-feed',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.signals.length).toBeGreaterThan(0);
  });

  it('should respond to an advisory signal (APPROVE)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/notifications/advisory/respond',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        signalId: 'adv_sig_001',
        action: 'APPROVE',
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 5,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.action).toBe('APPROVED');
    expect(body.order.status).toBe('FILLED');
  });
});
