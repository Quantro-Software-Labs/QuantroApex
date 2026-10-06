# QuantroApex Load Test Suite

Performance benchmarking and stress test suite using **k6** to validate high-throughput concurrency (500+ users).

---

## 🛠️ Prerequisites

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

---

## 🚀 Running Tests

### 1. Smoke Test (Pre-flight Sanity Check)

Run before starting full load tests to confirm route availability:

```bash
k6 run scripts/load-tests/smoke_test.js --env BASE_URL=http://localhost:3000
```

### 2. Full Load Test (500 Concurrent Users)

```bash
k6 run scripts/load-tests/load_test.js --env BASE_URL=http://localhost:3000
```

Against Staging environment:

```bash
k6 run scripts/load-tests/load_test.js \
  --env BASE_URL=https://api.quantrolabs.app \
  --out json=results/load_test_$(date +%Y%m%d_%H%M%S).json
```

---

## 📊 SLA Performance Thresholds

| Metric | Threshold SLA |
|--------|---------------|
| `http_req_duration` p(95) | `< 2,000ms` |
| `http_req_duration` p(99) | `< 5,000ms` |
| `http_req_failed` | `< 1%` |
| `auth_latency` p(95) | `< 1,500ms` |
| `feed_latency` p(95) | `< 1,000ms` |
| `execution_latency` p(95) | `< 3,000ms` |
| `order_placement_success` | `≥ 99%` |
| `api_error_rate` | `< 0.5%` |

---

## 📈 Ramp-Up Profile

| Stage | Duration | Target Virtual Users (VUs) |
|-------|----------|----------------------------|
| **Warm-up** | 1m | 100 |
| **Sustained** | 2m | 100 |
| **Scale** | 1m | 250 |
| **Sustained** | 2m | 250 |
| **Peak** | 1m | **500** |
| **Stress Window** | **3m** | **500** |
| **Ramp-down** | 1m | 0 |
