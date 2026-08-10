import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';

describe('Risk Vault Endpoints & Enforcement', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@risktest.com' } },
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'user@risktest.com',
        password: 'Password123!',
      },
    });

    const body = JSON.parse(regRes.payload);
    accessToken = body.accessToken;
    userId = body.user.id;
  });

  it('should fetch default risk vault settings', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.isEmergencyStopped).toBe(false);
    expect(Number(body.riskVault.dailyLossLimit)).toBe(500);
  });

  it('should update risk vault parameters', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        dailyLossLimit: 1000,
        maxDrawdown: 0.20,
        perTradeExposure: 0.10,
        cryptoEnabled: true,
        stocksEnabled: true,
        forexEnabled: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(Number(body.riskVault.dailyLossLimit)).toBe(1000);
    expect(body.riskVault.cryptoEnabled).toBe(true);
  });

  it('should activate emergency stop and block trade validation', async () => {
    const stopRes = await app.inject({
      method: 'POST',
      url: '/risk-vault/emergency-stop',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(stopRes.statusCode).toBe(200);
    const stopBody = JSON.parse(stopRes.payload);
    expect(stopBody.emergencyStoppedAt).not.toBeNull();

    // Trade validation attempt
    const valRes = await app.inject({
      method: 'POST',
      url: '/risk-vault/validate-trade',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        tradeValue: 1000,
        assetClass: 'STOCKS',
      },
    });

    expect(valRes.statusCode).toBe(200);
    const valBody = JSON.parse(valRes.payload);
    expect(valBody.allowed).toBe(false);
    expect(valBody.code).toBe('EMERGENCY_STOPPED');
  });

  it('should reject trades for disabled asset classes', async () => {
    // Disable crypto
    await app.inject({
      method: 'PUT',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        dailyLossLimit: 500,
        maxDrawdown: 0.15,
        perTradeExposure: 0.05,
        cryptoEnabled: false,
        stocksEnabled: true,
        forexEnabled: false,
      },
    });

    const valRes = await app.inject({
      method: 'POST',
      url: '/risk-vault/validate-trade',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        tradeValue: 500,
        assetClass: 'CRYPTO',
      },
    });

    expect(valRes.statusCode).toBe(200);
    const body = JSON.parse(valRes.payload);
    expect(body.allowed).toBe(false);
    expect(body.code).toBe('ASSET_CLASS_DISABLED');
  });

  it('should reject trades exceeding max per-trade exposure limit', async () => {
    // 5% per-trade exposure limit on $100,000 equity = max $5,000
    const valRes = await app.inject({
      method: 'POST',
      url: '/risk-vault/validate-trade',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        tradeValue: 10000, // Exceeds $5,000
        assetClass: 'STOCKS',
        portfolioEquity: 100000,
      },
    });

    expect(valRes.statusCode).toBe(200);
    const body = JSON.parse(valRes.payload);
    expect(body.allowed).toBe(false);
    expect(body.code).toBe('EXPOSURE_LIMIT_EXCEEDED');
  });

  it('should resume trading after emergency stop', async () => {
    await app.inject({
      method: 'POST',
      url: '/risk-vault/emergency-stop',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const resumeRes = await app.inject({
      method: 'POST',
      url: '/risk-vault/resume',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(resumeRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: '/risk-vault',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const getBody = JSON.parse(getRes.payload);
    expect(getBody.isEmergencyStopped).toBe(false);
  });
});
