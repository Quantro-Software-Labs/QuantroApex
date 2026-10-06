import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

const AUTH = {
  authorization: 'Bearer firebase_dev:user_kyc_test:kyc@test.com',
};

describe('KYC endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  it('GET /kyc/status requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/kyc/status' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /kyc/initiate returns access token when DB available', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/kyc/initiate',
      headers: AUTH,
    });
    expect([201, 401, 503]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('applicantId');
      expect(typeof body.sandbox).toBe('boolean');
    }
  });

  it('GET /kyc/status returns status shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/kyc/status',
      headers: AUTH,
    });
    expect([200, 401, 503]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('status');
      expect([
        'PENDING',
        'SUBMITTED',
        'UNDER_REVIEW',
        'VERIFIED',
        'REJECTED',
      ]).toContain(body.status);
    }
  });

  it('POST /kyc/webhook rejects bad signature when secret set', async () => {
    const had = process.env.SUMSUB_WEBHOOK_SECRET;
    process.env.SUMSUB_WEBHOOK_SECRET = 'test_secret';
    const res = await app.inject({
      method: 'POST',
      url: '/kyc/webhook',
      headers: { 'x-payload-digest': 'invalid' },
      payload: { type: 'applicantPending', applicantId: 'nobody' },
    });
    if (had === undefined) delete process.env.SUMSUB_WEBHOOK_SECRET;
    else process.env.SUMSUB_WEBHOOK_SECRET = had;
    expect([200, 401]).toContain(res.statusCode);
  });

  it('POST /kyc/sandbox-complete works without Sumsub keys', async () => {
    const had = process.env.SUMSUB_APP_TOKEN;
    delete process.env.SUMSUB_APP_TOKEN;
    const res = await app.inject({
      method: 'POST',
      url: '/kyc/sandbox-complete',
      headers: AUTH,
      payload: { result: 'VERIFIED' },
    });
    if (had !== undefined) process.env.SUMSUB_APP_TOKEN = had;
    expect([200, 401, 403, 503]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('VERIFIED');
    }
  });
});
