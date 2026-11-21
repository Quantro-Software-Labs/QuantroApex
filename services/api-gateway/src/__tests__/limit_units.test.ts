import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { registerTestUser } from './helpers/firebase_auth.js';
import { validateTradeRisk } from '../lib/risk_enforcer.js';
import { validateStoredLimit } from '../lib/risk/limit_helpers.js';

describe('A.1 Limit units & validation', () => {
  let app: FastifyInstance;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@limitunits.test' } },
    });

    const session = await registerTestUser(app, 'trader@limitunits.test');
    userId = session.user.id;
    accessToken = session.accessToken;
  });

  it('rejects stored 15 with unit PERCENT at write time', async () => {
    // Attempt to write dailyLossLimit: 15 with explicit unit PERCENT
    const res = await app.inject({
      method: 'PUT',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        dailyLossLimit: 15,
        dailyLossLimitUnit: 'PERCENT',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('ValidationError');
    expect(body.message).toMatch(/0 < x <= 1\.0/);
  });

  it('rejects stored 15 with unit PERCENT for maxDrawdown and perTradeExposure', async () => {
    const res1 = await app.inject({
      method: 'PUT',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        maxDrawdown: 15,
        maxDrawdownUnit: 'PERCENT',
      },
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'PUT',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        perTradeExposure: 15,
        perTradeExposureUnit: 'PERCENT',
      },
    });
    expect(res2.statusCode).toBe(400);
  });

  it('validates unit PERCENT stored strictly as 0 < x <= 1.0, and USD > 0', () => {
    // Valid fraction 0.15 for 15%
    expect(() => validateStoredLimit(0.15, 'PERCENT', 'maxDrawdown')).not.toThrow();
    // Valid fraction 0.05 for 5%
    expect(() => validateStoredLimit(0.05, 'PERCENT', 'perTradeExposure')).not.toThrow();
    // Valid dollar 500
    expect(() => validateStoredLimit(500, 'USD', 'dailyLossLimit')).not.toThrow();

    // Invalid: 15 with PERCENT rejected
    expect(() => validateStoredLimit(15, 'PERCENT', 'dailyLossLimit')).toThrow(
      /must be a fraction 0 < x <= 1\.0/,
    );
    // Invalid: <= 0 rejected
    expect(() => validateStoredLimit(0, 'PERCENT', 'dailyLossLimit')).toThrow();
    expect(() => validateStoredLimit(-5, 'USD', 'dailyLossLimit')).toThrow(/greater than 0/);
  });

  it('stored 15 with unit PERCENT in DB is never read as $15 in risk_enforcer', () => {
    // If a legacy or mocked vault had dailyLossLimit: 15 with unit PERCENT,
    // on a portfolio of $10,000, it computes portfolioEquity * 15 = $150,000, NEVER $15.
    const mockVault: any = {
      dailyLossLimit: 15,
      dailyLossLimitUnit: 'PERCENT',
      maxDrawdown: 0.15,
      maxDrawdownUnit: 'PERCENT',
      perTradeExposure: 0.05,
      perTradeExposureUnit: 'PERCENT',
      assetsEnabled: true,
      emergencyStop: false,
    };

    // A realized loss of $50 should NOT breach the limit if it were $150,000,
    // whereas if it were read as $15, a loss of $50 would breach it!
    const result = validateTradeRisk({
      userId: 'test_user',
      riskVault: mockVault,
      portfolioEquity: 10000,
      tradeValue: 100,
      assetClass: 'STOCKS',
      realizedLossToday: 50, // Greater than $15, but much less than $150,000 (15 * 10000)
    });

    // Allowed must be true because 50 < (10000 * 15 = 150000)
    // If it were mistakenly read as $15, allowed would be false with CLASS_DAILY_LOSS_LIMIT
    expect(result.allowed).toBe(true);
    expect(result.code).not.toBe('CLASS_DAILY_LOSS_LIMIT');
  });
});
