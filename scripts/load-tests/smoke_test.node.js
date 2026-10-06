/**
 * QuantroApex — Node.js End-to-End Smoke Test
 * ============================================
 * Validates active API Gateway routes using native fetch.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const headers = {
  Authorization: 'Bearer firebase_dev:smoke_user:smoke@quantroapex.test',
  'Content-Type': 'application/json',
};

async function runSmokeTest() {
  console.log(`\n🚀 Running End-to-End Smoke Test against ${BASE_URL}...\n`);

  const endpoints = [
    { name: 'GET /health', path: '/health', expectedStatus: 200 },
    { name: 'GET /auth/me', path: '/auth/me', expectedStatus: [200, 401] },
    { name: 'GET /activity-feed', path: '/activity-feed', expectedStatus: [200, 401] },
    { name: 'GET /strategies', path: '/strategies', expectedStatus: [200, 401] },
    { name: 'GET /analytics/metrics', path: '/analytics/metrics', expectedStatus: [200, 401] },
    { name: 'GET /simulation/summary', path: '/simulation/summary', expectedStatus: [200, 401] },
    { name: 'GET /ai/advisory-feed', path: '/ai/advisory-feed', expectedStatus: [200, 401] },
    { name: 'POST /ai/explain-trade', path: '/ai/explain-trade', method: 'POST', body: JSON.stringify({ symbol: 'AAPL', side: 'BUY', quantity: 10 }), expectedStatus: [200, 401] },
  ];

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method || 'GET',
        headers,
        body: ep.body,
      });

      const allowedStatuses = Array.isArray(ep.expectedStatus) ? ep.expectedStatus : [ep.expectedStatus];
      const isSuccess = allowedStatuses.includes(res.status);

      if (isSuccess) {
        console.log(`  ✅ [PASS] ${ep.name} — Status: ${res.status}`);
        passed++;
      } else {
        console.log(`  ❌ [FAIL] ${ep.name} — Status: ${res.status} (expected ${allowedStatuses.join(' or ')})`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ [ERROR] ${ep.name} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Smoke Test Summary: ${passed} PASSED | ${failed} FAILED\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTest();
