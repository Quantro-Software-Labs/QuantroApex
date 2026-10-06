/**
 * QuantroApex — k6 Load Test Suite
 * =================================
 * Sprint 10: 500 concurrent users, full user journey coverage.
 *
 * Run:
 *   k6 run scripts/load-tests/load_test.js --env BASE_URL=http://localhost:3000
 *
 * Install k6:
 *   brew install k6          (macOS)
 *   sudo snap install k6     (Linux)
 *   choco install k6         (Windows)
 *
 * Exit codes:
 *   0 — all thresholds passed
 *   1 — one or more thresholds breached
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ─── Custom metrics ──────────────────────────────────────────────────────────

const wsConnectionErrors = new Counter('ws_connection_errors');
const wsMessagesReceived = new Counter('ws_messages_received');
const orderPlacementRate = new Rate('order_placement_success');
const apiErrorRate = new Rate('api_error_rate');
const authLatency = new Trend('auth_latency', true);
const feedLatency = new Trend('feed_latency', true);
const executionLatency = new Trend('execution_latency', true);

// ─── Test configuration ───────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Staged ramp-up matching a real beta launch:
 *  - Ramp to 100 users over 1 min
 *  - Hold at 100 for 2 min
 *  - Ramp to 250 users over 1 min
 *  - Hold at 250 for 2 min
 *  - Peak: ramp to 500 users over 1 min
 *  - Hold at 500 for 3 min (the stress window)
 *  - Ramp down over 1 min
 */
export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 250 },
    { duration: '2m', target: 250 },
    { duration: '1m', target: 500 },
    { duration: '3m', target: 500 },
    { duration: '1m', target: 0 },
  ],

  thresholds: {
    // HTTP — 95th percentile must be under 2 seconds for all endpoints
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    // Error rate — less than 1% of requests may fail
    http_req_failed: ['rate<0.01'],
    // Auth must be fast — this is on every request
    auth_latency: ['p(95)<1500'],
    // Activity feed — real-time feel
    feed_latency: ['p(95)<1000'],
    // Order execution — acceptable latency for financial operations
    execution_latency: ['p(95)<3000'],
    // Order placement success rate must be ≥99%
    order_placement_success: ['rate>=0.99'],
    // API error rate under 0.5%
    api_error_rate: ['rate<0.005'],
  },

  // Give k6 a summary at the end
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ─── Shared test data ─────────────────────────────────────────────────────────

const TEST_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ'];
const ASSET_CLASSES = ['STOCKS'];

/**
 * Dev auth token format — only works when NODE_ENV=development.
 * Replace with real Firebase tokens for staging load tests.
 */
function devToken(userId) {
  return `firebase_dev:user_load_${userId}:load${userId}@quantroapex.test`;
}

function authHeaders(userId) {
  return {
    Authorization: `Bearer ${devToken(userId)}`,
    'Content-Type': 'application/json',
  };
}

// ─── Scenario: Health check (baseline) ───────────────────────────────────────

export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'health ok': (r) => r.status === 200 });
  sleep(1);
}

// ─── Main scenario ────────────────────────────────────────────────────────────

export default function () {
  const userId = `vu${__VU}_${randomIntBetween(1, 1000)}`;
  const headers = authHeaders(userId);

  // ── Auth ─────────────────────────────────────────────────────────────────

  group('Auth — /auth/me', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/auth/me`, { headers });
    authLatency.add(Date.now() - start);

    const ok = check(res, {
      'me 200 or 404': (r) => r.status === 200 || r.status === 404,
      'me not 500': (r) => r.status !== 500,
    });
    if (!ok) apiErrorRate.add(1); else apiErrorRate.add(0);
  });

  sleep(randomIntBetween(1, 2));

  // ── Activity Feed ─────────────────────────────────────────────────────────

  group('Activity Feed — /activity-feed', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/activity-feed?page=1&limit=20`, { headers });
    feedLatency.add(Date.now() - start);

    check(res, {
      'feed 200': (r) => r.status === 200,
      'feed has entries': (r) => {
        try { return Array.isArray(JSON.parse(r.body).entries); } catch { return false; }
      },
    });
  });

  sleep(randomIntBetween(1, 2));

  // ── Strategy Marketplace ──────────────────────────────────────────────────

  group('Strategies — /strategies', () => {
    const assetClass = randomItem(ASSET_CLASSES);
    const res = http.get(`${BASE_URL}/strategies?assetClass=${assetClass}`, { headers });
    check(res, {
      'strategies 200': (r) => r.status === 200,
      'strategies has data': (r) => {
        try { return Array.isArray(JSON.parse(r.body).strategies); } catch { return false; }
      },
    });
  });

  sleep(randomIntBetween(1, 2));

  // ── Risk Vault ────────────────────────────────────────────────────────────

  group('Risk Vault — GET /risk-vault', () => {
    const res = http.get(`${BASE_URL}/risk-vault`, { headers });
    check(res, { 'risk vault 200 or 404': (r) => r.status === 200 || r.status === 404 });
  });

  sleep(randomIntBetween(1, 2));

  // ── Market Data ───────────────────────────────────────────────────────────

  group('Market — /market/quote', () => {
    const symbol = randomItem(TEST_SYMBOLS);
    const res = http.get(`${BASE_URL}/market/quote?symbol=${symbol}`, { headers });
    check(res, {
      'quote 200 or 503': (r) => r.status === 200 || r.status === 503,
      'quote not 500': (r) => r.status !== 500,
    });
  });

  sleep(randomIntBetween(1, 2));

  // ── Simulation Order (safe — always simulated) ────────────────────────────

  group('Execution — POST /execution/order (simulation)', () => {
    const symbol = randomItem(TEST_SYMBOLS);
    const payload = JSON.stringify({
      symbol,
      side: randomItem(['BUY', 'SELL']),
      orderType: 'MARKET',
      quantity: randomIntBetween(1, 10),
      isSimulated: true,
      owner: 'MANUAL',
      assetClass: 'STOCKS',
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/execution/order`, payload, { headers });
    executionLatency.add(Date.now() - start);

    const success = check(res, {
      'order 201 or 403 or 422': (r) => [201, 403, 422].includes(r.status),
      'order not 500': (r) => r.status !== 500,
    });
    orderPlacementRate.add(res.status === 201 ? 1 : 0);
    if (!success) apiErrorRate.add(1); else apiErrorRate.add(0);
  });

  sleep(randomIntBetween(1, 2));

  // ── Analytics ─────────────────────────────────────────────────────────────

  group('Analytics — /analytics', () => {
    const res = http.get(`${BASE_URL}/analytics?assetClass=STOCKS`, { headers });
    check(res, { 'analytics 200 or 404': (r) => r.status === 200 || r.status === 404 });
  });

  sleep(randomIntBetween(1, 2));

  // ── KYC Status ────────────────────────────────────────────────────────────

  group('KYC — /kyc/status', () => {
    const res = http.get(`${BASE_URL}/kyc/status`, { headers });
    check(res, {
      'kyc status 200': (r) => r.status === 200,
      'kyc has status field': (r) => {
        try { return typeof JSON.parse(r.body).status === 'string'; } catch { return false; }
      },
    });
  });

  sleep(randomIntBetween(1, 2));

  // ── Onboarding State ──────────────────────────────────────────────────────

  group('Onboarding — /onboarding/state', () => {
    const res = http.get(`${BASE_URL}/onboarding/state`, { headers });
    check(res, { 'onboarding 200 or 404': (r) => r.status === 200 || r.status === 404 });
  });

  sleep(randomIntBetween(1, 3));
}

// ─── WebSocket scenario (separate VU group) ───────────────────────────────────

export function wsScenario() {
  const userId = `ws_vu${__VU}_${randomIntBetween(1, 1000)}`;
  const wsUrl = BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');
  const token = devToken(userId);

  const res = ws.connect(
    `${wsUrl}/activity-feed/ws/events?token=${encodeURIComponent(token)}`,
    {},
    (socket) => {
      socket.on('open', () => {
        // Send ping to verify bidirectional comms
        socket.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
      });

      socket.on('message', (data) => {
        wsMessagesReceived.add(1);
        try {
          const msg = JSON.parse(data);
          check(msg, {
            'ws message has type': (m) => typeof m.type === 'string',
          });
        } catch (_) {}
      });

      socket.on('error', () => {
        wsConnectionErrors.add(1);
      });

      // Hold connection for a realistic session duration
      socket.setTimeout(() => socket.close(), 15000);
    },
  );

  check(res, {
    'ws connected (101)': (r) => r && r.status === 101,
  });

  sleep(randomIntBetween(3, 8));
}
