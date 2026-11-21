import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import {
  setPaystackFakeClient,
  SERVER_PRICE_TABLE,
} from '../lib/payments/paystack_client.js';

describe('C. Real Payments via Paystack', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;
  let userEmail: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@paymentsreal.test' } },
    });
    setPaystackFakeClient(null);

    const session = await registerTestUser(app, 'trader@paymentsreal.test');
    userId = session.user.id;
    accessToken = session.accessToken;
    userEmail = session.user.email;
  });

  afterEach(() => {
    setPaystackFakeClient(null);
  });

  it('initialise ignores client amount and uses server-side price table', async () => {
    setPaystackFakeClient({
      initializeTransaction: async (params) => {
        expect(params.amount).toBe(SERVER_PRICE_TABLE.PRO.amountKobo); // 7,900,000 kobo
        expect(params.plan).toBe(SERVER_PRICE_TABLE.PRO.planCode);
        return {
          authorizationUrl: 'https://checkout.paystack.com/fake_auth_123',
          accessCode: 'fake_access_123',
          reference: 'psk_ref_init_123',
        };
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/initialise',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        plan: 'PRO',
        // Client sends fake/tampered amount — server MUST ignore and use price table
        amount: 100,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.reference).toBe('psk_ref_init_123');
  });

  it('/subscriptions/verify ignores client plan/amount and grants plan verified by Paystack', async () => {
    const verifiedRef = 'psk_ref_verify_legit_001';

    setPaystackFakeClient({
      verifyTransaction: async (ref) => {
        expect(ref).toBe(verifiedRef);
        return {
          status: 'success',
          reference: ref,
          amount: SERVER_PRICE_TABLE.PRO.amountKobo, // 79,000 NGN in kobo
          currency: 'NGN',
          planCode: SERVER_PRICE_TABLE.PRO.planCode,
          metadata: { userId, plan: 'PRO' },
          customer: { email: userEmail },
        };
      },
    });

    // Client attempts to send tampered plan "FREE" and amount 50
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        reference: verifiedRef,
        plan: 'FREE',
        amount: 50,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.subscription.plan).toBe('PRO');

    // Verify stored PaymentTransaction
    const tx = await prisma.paymentTransaction.findUnique({
      where: { reference: verifiedRef },
    });
    expect(tx).toBeDefined();
    expect(tx?.plan).toBe('PRO');
    expect(tx?.amount).toBe(SERVER_PRICE_TABLE.PRO.amountKobo);
  });

  it('rejects /subscriptions/verify if payment amount does not match price table', async () => {
    const underpaidRef = 'psk_ref_underpaid_002';

    setPaystackFakeClient({
      verifyTransaction: async () => ({
        status: 'success',
        reference: underpaidRef,
        amount: 1000, // Underpaid: 1,000 kobo instead of 7,900,000 kobo
        currency: 'NGN',
        planCode: SERVER_PRICE_TABLE.PRO.planCode,
        metadata: { userId, plan: 'PRO' },
        customer: { email: userEmail },
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reference: underpaidRef },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe('PLAN_AMOUNT_MISMATCH');

    // Plan must NOT be granted
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    expect(sub?.plan).not.toBe('PRO');
  });

  it('rejects reused reference on /subscriptions/verify', async () => {
    const reusedRef = 'psk_ref_reused_003';

    // First payment succeeds
    setPaystackFakeClient({
      verifyTransaction: async () => ({
        status: 'success',
        reference: reusedRef,
        amount: SERVER_PRICE_TABLE.CORE.amountKobo,
        currency: 'NGN',
        planCode: SERVER_PRICE_TABLE.CORE.planCode,
        metadata: { userId, plan: 'CORE' },
        customer: { email: userEmail },
      }),
    });

    const res1 = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reference: reusedRef },
    });
    expect(res1.statusCode).toBe(200);

    // Second verification with the exact same reference must be rejected
    const res2 = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reference: reusedRef },
    });

    expect(res2.statusCode).toBe(400);
    expect(JSON.parse(res2.payload).error).toBe('REFERENCE_ALREADY_USED');
  });

  it('webhook verifies raw body HMAC-SHA512 signature and rejects bad signatures', async () => {
    const testSecret = 'sk_test_paystack_webhook_secret_key_123';
    process.env.PAYSTACK_SECRET_KEY = testSecret;

    const payload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'psk_webhook_sig_001',
        amount: SERVER_PRICE_TABLE.CORE.amountKobo,
        currency: 'NGN',
        customer: { email: userEmail },
        plan: { plan_code: SERVER_PRICE_TABLE.CORE.planCode },
        metadata: { userId, plan: 'CORE' },
      },
    });

    // 1. Bad signature -> 401
    const badRes = await app.inject({
      method: 'POST',
      url: '/subscriptions/webhook',
      headers: {
        'x-paystack-signature': 'bad_fake_signature_hex_1234567890abcdef',
        'content-type': 'application/json',
      },
      payload,
    });
    expect(badRes.statusCode).toBe(401);

    // 2. Good HMAC over RAW body bytes -> 200
    const goodSig = createHmac('sha512', testSecret).update(payload).digest('hex');
    const goodRes = await app.inject({
      method: 'POST',
      url: '/subscriptions/webhook',
      headers: {
        'x-paystack-signature': goodSig,
        'content-type': 'application/json',
      },
      payload,
    });
    expect(goodRes.statusCode).toBe(200);

    // Plan granted to user
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    expect(sub?.plan).toBe('CORE');

    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it('webhook with unknown plan code grants nothing and never defaults to CORE', async () => {
    const testSecret = 'sk_test_webhook_unknown_plan';
    process.env.PAYSTACK_SECRET_KEY = testSecret;

    const payload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'psk_unknown_plan_ref_999',
        amount: 500000,
        currency: 'NGN',
        customer: { email: userEmail },
        plan: { plan_code: 'PLN_unknown_mystery_tier' },
        metadata: { userId, plan: 'UNKNOWN_PLAN_TIER' },
      },
    });

    const goodSig = createHmac('sha512', testSecret).update(payload).digest('hex');
    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/webhook',
      headers: {
        'x-paystack-signature': goodSig,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ignored).toBe('UNKNOWN_PLAN');

    // Crucial requirement: NEVER default to CORE!
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    expect(sub?.plan).toBe('FREE');

    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it('mobile in-app purchase verify routes return 501 and grant nothing', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/subscriptions/in-app-purchase/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { receipt: 'mock_apple_store_receipt' },
    });
    expect(res1.statusCode).toBe(501);

    const res2 = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify-iap',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseToken: 'mock_google_play_token' },
    });
    expect(res2.statusCode).toBe(501);

    // No subscription granted
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    expect(sub?.plan).toBe('FREE');
  });

  it('returns 503 PAYMENTS_UNAVAILABLE when Paystack secret key is missing', async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    setPaystackFakeClient(null);

    const res = await app.inject({
      method: 'POST',
      url: '/subscriptions/verify',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reference: 'some_ref' },
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).error).toBe('PAYMENTS_UNAVAILABLE');
  });
});
