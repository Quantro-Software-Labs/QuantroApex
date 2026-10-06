# QuantroApex — Load Test Suite
> Sprint 10 · k6 · 500 concurrent users

## Prerequisites

Install [k6](https://k6.io/docs/getting-started/installation/):

```bash
# macOS
brew install k6

# Ubuntu / Debian
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows
choco install k6
```

## Running Tests

### 1. Smoke test first (always run before load test)

```bash
k6 run scripts/load-tests/smoke_test.js --env BASE_URL=http://localhost:3000
```

All routes should return 200/201 for valid requests and never 500.

### 2. Full load test — 500 concurrent users

```bash
k6 run scripts/load-tests/load_test.js --env BASE_URL=http://localhost:3000
```

Or against staging:

```bash
k6 run scripts/load-tests/load_test.js \
  --env BASE_URL=https://api.quantrolabs.app \
  --out json=results/load_test_$(date +%Y%m%d_%H%M%S).json
```

## Thresholds

| Metric | Threshold |
|--------|-----------|
| `http_req_duration` p(95) | < 2,000ms |
| `http_req_duration` p(99) | < 5,000ms |
| `http_req_failed` | < 1% |
| `auth_latency` p(95) | < 1,500ms |
| `feed_latency` p(95) | < 1,000ms |
| `execution_latency` p(95) | < 3,000ms |
| `order_placement_success` | ≥ 99% |
| `api_error_rate` | < 0.5% |

## Staged Ramp Profile

| Stage | Duration | Target VUs |
|-------|----------|-----------|
| Warm-up | 1m | 100 |
| Sustained | 2m | 100 |
| Scale | 1m | 250 |
| Sustained | 2m | 250 |
| Peak | 1m | **500** |
| **Stress window** | **3m** | **500** |
| Ramp-down | 1m | 0 |

## Notes

- The tests use dev auth tokens (`firebase_dev:...` format) which only work when `NODE_ENV=development`
- For staging load tests, provision dedicated test user Firebase UIDs and pass real ID tokens via `--env TOKEN=...`
- Load tests should never run against production — use staging environment only
- Results are not automatically stored — pipe to `--out json=results/...` for persistence
