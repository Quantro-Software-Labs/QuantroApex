import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { assertKycVerified } from '../routes/kyc.js';

describe('D. KYC Hardening & Webhook Verification', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@kychardening.test' } },
    });

    const session = await registerTestUser(app, 'trader@kychardening.test');
    userId = session.user.id;
    accessToken = session.accessToken;
  });

  it('/kyc/sandbox-complete returns 404 when NODE_ENV is not test', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const res = await app.inject({
        method: 'POST',
        url: '/kyc/sandbox-complete',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { result: 'VERIFIED' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('/kyc/sandbox-complete works when NODE_ENV === test', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/kyc/sandbox-complete',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { result: 'VERIFIED' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('VERIFIED');
  });

  it('if Sumsub is not configured, KYC stays PENDING and LIVE trading stays blocked', async () => {
    const origAppToken = process.env.SUMSUB_APP_TOKEN;
    const origSecret = process.env.SUMSUB_SECRET_KEY;
    delete process.env.SUMSUB_APP_TOKEN;
    delete process.env.SUMSUB_SECRET_KEY;

    try {
      // 1. Initiate KYC
      const initRes = await app.inject({
        method: 'POST',
        url: '/kyc/initiate',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(initRes.statusCode).toBe(200);
      expect(JSON.parse(initRes.payload).status).toBe('PENDING');

      // 2. Check DB status
      const kyc = await prisma.kYCVerification.findUnique({ where: { userId } });
      expect(kyc?.status).toBe('PENDING');

      // 3. LIVE trading stays blocked via assertKycVerified
      await expect(assertKycVerified(userId)).rejects.toThrow('Identity verification required');

      // 4. LIVE order attempt returns 403 KYC_REQUIRED
      const orderRes = await app.inject({
        method: 'POST',
        url: '/execution/order',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          mode: 'LIVE',
          assetClass: 'STOCKS',
        },
      });
      expect(orderRes.statusCode).toBe(403);
      expect(JSON.parse(orderRes.payload).error).toBe('KYC_REQUIRED');
    } finally {
      if (origAppToken !== undefined) process.env.SUMSUB_APP_TOKEN = origAppToken;
      if (origSecret !== undefined) process.env.SUMSUB_SECRET_KEY = origSecret;
    }
  });

  it('webhook verifies raw body HMAC-SHA256 signature using constant-time compare', async () => {
    const secret = 'sumsub_test_webhook_secret_key_777';
    process.env.SUMSUB_WEBHOOK_SECRET = secret;

    // Create an applicant record in DB
    await prisma.kYCVerification.upsert({
      where: { userId },
      create: { userId, sumsubApplicantId: 'sumsub_app_raw_123', status: 'UNDER_REVIEW' },
      update: { sumsubApplicantId: 'sumsub_app_raw_123', status: 'UNDER_REVIEW' },
    });

    const payload = JSON.stringify({
      type: 'applicantReviewed',
      applicantId: 'sumsub_app_raw_123',
      reviewResult: {
        reviewAnswer: 'GREEN',
        reviewId: 'rev_ok_123',
      },
    });

    // 1. Invalid signature rejected
    const badRes = await app.inject({
      method: 'POST',
      url: '/kyc/webhook',
      headers: {
        'x-payload-digest': 'bad_sumsub_signature_hex_123',
        'content-type': 'application/json',
      },
      payload,
    });
    expect(badRes.statusCode).toBe(401);

    // 2. Good HMAC signature over raw body accepted
    const goodSig = createHmac('sha256', secret).update(payload).digest('hex');
    const goodRes = await app.inject({
      method: 'POST',
      url: '/kyc/webhook',
      headers: {
        'x-payload-digest': goodSig,
        'content-type': 'application/json',
      },
      payload,
    });
    expect(goodRes.statusCode).toBe(200);

    const verifiedKyc = await prisma.kYCVerification.findUnique({ where: { userId } });
    expect(verifiedKyc?.status).toBe('VERIFIED');

    delete process.env.SUMSUB_WEBHOOK_SECRET;
  });
});
