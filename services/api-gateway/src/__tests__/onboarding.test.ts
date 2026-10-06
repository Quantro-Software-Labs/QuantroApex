import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { FastifyInstance } from 'fastify';
import { registerTestUser } from './helpers/firebase_auth.js';

describe('Onboarding Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@onboardingtest.com' } },
    });

    const session = await registerTestUser(app, 'user@onboardingtest.com');
    accessToken = session.accessToken;
    userId = session.user.id;
  });

  it('should fetch initial onboarding progress', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/onboarding/progress',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.experienceLevel).toBe('NEWCOMER');
    expect(body.onboardingCompletedAt).toBeNull();
    expect(body.progress.path).toBe('NEWCOMER');
    expect(body.progress.currentStep).toBe(1);
  });

  it('should set onboarding path to EXPRESS', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/onboarding/path',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        path: 'EXPRESS',
        experienceLevel: 'PROFESSIONAL',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.experienceLevel).toBe('PROFESSIONAL');
    expect(body.progress.path).toBe('EXPRESS');
    expect(body.progress.currentStep).toBe(1);
  });

  it('should update current step and state', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/onboarding/step',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        currentStep: 3,
        state: { globalBrainConsent: true },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.progress.currentStep).toBe(3);
    expect(body.progress.state.globalBrainConsent).toBe(true);
  });

  it('should complete onboarding and save profile, risk vault & preferences', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/onboarding/complete',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        experienceLevel: 'INTERMEDIATE',
        globalBrainConsent: true,
        riskProfile: { score: 75, style: 'Growth' },
        tradingCapital: 25000,
        preferredTradingMode: 'SIM',
        riskVault: {
          dailyLossLimit: 500,
          maxDrawdown: 0.15,
          perTradeExposure: 0.05,
          cryptoEnabled: true,
          stocksEnabled: true,
          forexEnabled: false,
        },
        notificationPrefs: {
          digestInterval: 'daily',
          milestoneAlerts: true,
          lossThresholdPct: 5,
          lossAlertsEnabled: true,
          pushEnabled: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.message).toBe('Onboarding completed successfully');

    // Verify DB states
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        riskVaults: true,
        notificationPrefs: true,
        onboardingProgress: true,
      },
    });

    expect(updatedUser?.onboardingCompletedAt).not.toBeNull();
    expect(updatedUser?.experienceLevel).toBe('INTERMEDIATE');
    expect(updatedUser?.profile?.globalBrainConsent).toBe(true);
    expect(Number(updatedUser?.profile?.tradingCapital)).toBe(25000);
    const stocksVault = updatedUser?.riskVaults?.find((v) => v.assetClass === 'STOCKS');
    expect(Number(stocksVault?.dailyLossLimit)).toBe(500);
    expect(stocksVault?.cryptoEnabled).toBe(true);
    expect(updatedUser?.riskVaults?.length).toBeGreaterThanOrEqual(4);
    expect(updatedUser?.onboardingProgress?.completedAt).not.toBeNull();
  });
});
