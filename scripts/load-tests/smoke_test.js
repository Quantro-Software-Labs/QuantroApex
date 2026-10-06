/**
 * QuantroApex — Smoke Test
 * ========================
 * Fast sanity check before running the full load test.
 * Validates all routes respond correctly with 1 user.
 *
 * Run:
 *   k6 run scripts/load-tests/smoke_test.js --env BASE_URL=http://localhost:3000
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],    // Allow up to 5% failures (auth mismatches expected in smoke)
    http_req_duration: ['p(95)<5000'], // Generous 5s for smoke — not a performance test
  },
};

const headers = {
  Authorization: 'Bearer firebase_dev:smoke_user:smoke@quantroapex.test',
  'Content-Type': 'application/json',
};

export default function () {
  group('Health', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'health 200': (r) => r.status === 200 });
  });

  group('Auth me', () => {
    const res = http.get(`${BASE_URL}/auth/me`, { headers });
    check(res, { 'auth me not 500': (r) => r.status !== 500 });
  });

  group('Activity Feed', () => {
    const res = http.get(`${BASE_URL}/activity-feed`, { headers });
    check(res, { 'feed not 500': (r) => r.status !== 500 });
  });

  group('Strategies', () => {
    const res = http.get(`${BASE_URL}/strategies`, { headers });
    check(res, { 'strategies not 500': (r) => r.status !== 500 });
  });

  group('Market quote', () => {
    const res = http.get(`${BASE_URL}/market/quote?symbol=AAPL`, { headers });
    check(res, { 'quote not 500': (r) => r.status !== 500 });
  });

  group('Risk Vault', () => {
    const res = http.get(`${BASE_URL}/risk-vault`, { headers });
    check(res, { 'risk-vault not 500': (r) => r.status !== 500 });
  });

  group('KYC Status', () => {
    const res = http.get(`${BASE_URL}/kyc/status`, { headers });
    check(res, { 'kyc not 500': (r) => r.status !== 500 });
  });

  group('Analytics', () => {
    const res = http.get(`${BASE_URL}/analytics/metrics`, { headers });
    check(res, { 'analytics not 500': (r) => r.status !== 500 });
  });

  group('Simulation order', () => {
    const res = http.post(
      `${BASE_URL}/execution/order`,
      JSON.stringify({
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 1,
        isSimulated: true,
        owner: 'MANUAL',
        assetClass: 'STOCKS',
      }),
      { headers },
    );
    check(res, {
      'sim order not 500': (r) => r.status !== 500,
      'sim order 201 or gated': (r) => [201, 403, 422].includes(r.status),
    });
  });

  group('Advisory Feed', () => {
    const res = http.get(`${BASE_URL}/ai/advisory-feed?limit=5`, { headers });
    check(res, { 'advisory not 500': (r) => r.status !== 500 });
  });

  sleep(1);
}
