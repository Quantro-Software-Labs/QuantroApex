# QuantroApex AI Service

Python FastAPI service for **Smart Money Concepts (SMC)** overlays, **TA-Lib** indicators/patterns, and **VectorBT** backtesting.

Default port: **8001**

> Replaces `services/quant-engine` as the product brief AI service. Keep quant-engine only until callers are pointed here.

## Prerequisites

### System TA-Lib (recommended)

The Python `TA-Lib` package needs the C library installed first:

```bash
# Debian / Ubuntu
sudo apt-get install -y build-essential wget
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz
cd ta-lib/
./configure --prefix=/usr
make
sudo make install

# macOS
brew install ta-lib
```

If the C library is missing, the service still starts in **degraded mode** (pandas RSI/MACD/EMA + simple pattern stubs). Responses label the mode so clients can warn users.

`requirements.txt` does **not** hard-require `TA-Lib` or `vectorbt` — install them separately when the environment supports them:

```bash
pip install TA-Lib vectorbt 'plotly>=5.18.0,<6'
```

## Setup

```bash
cd services/ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Market data

Set Alpaca keys to pull live bars; otherwise analysis uses deterministic synthetic OHLCV:

```bash
export ALPACA_API_KEY=...
export ALPACA_SECRET_KEY=...
# optional: ALPACA_DATA_URL=https://data.alpaca.markets/v2
```

## Run

```bash
cd services/ai-service
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

From the monorepo root:

```bash
npm run ai:dev
```

Open docs: http://localhost:8001/docs

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + TA-Lib / VectorBT availability |
| `GET` | `/analysis/{asset_class}/{symbol}/{timeframe}` | SMC overlays + RSI/MACD/EMA |
| `POST` | `/backtest` | VectorBT (or fallback) strategy backtest |
| `GET` | `/patterns/list` | Available CDL* pattern names |
| `POST` | `/patterns/detect` | Detect patterns on OHLCV candles |

`POST /backtest/run` is retained as an alias for the api-gateway proxy.

### Analysis (SMC + indicators)

```bash
curl -s http://localhost:8001/analysis/crypto/BTCUSDT/1h
```

Returns structure (BOS/CHoCH), order blocks, FVG, liquidity pools, premium/discount zones, and indicators (`RSI`, `MACD`, `EMA20/50/200`). Candles come from **Alpaca** when keys are set, then the API gateway (`GATEWAY_URL`) if reachable; otherwise deterministic synthetic OHLCV is used.

### Detect patterns

```bash
curl -s http://localhost:8001/patterns/detect \
  -H 'Content-Type: application/json' \
  -d '{
    "candles": [
      {"open": 10, "high": 11, "low": 9.5, "close": 10.2},
      {"open": 10.2, "high": 10.3, "low": 9.8, "close": 9.9},
      {"open": 9.9, "high": 11.5, "low": 9.8, "close": 11.2}
    ],
    "patterns": ["CDLENGULFING", "CDLDOJI"]
  }'
```

### Run backtest

```bash
curl -s http://localhost:8001/backtest \
  -H 'Content-Type: application/json' \
  -d '{
    "candles": [
      {"open": 100, "high": 101, "low": 99, "close": 100.5, "timestamp": "2024-01-01"},
      {"open": 100.5, "high": 102, "low": 100, "close": 101.5, "timestamp": "2024-01-02"}
    ],
    "strategy": {"type": "sma_crossover", "params": {"fast": 5, "slow": 20}},
    "initial_cash": 10000
  }'
```

Strategy types: `sma_crossover`, `rsi`, `buy_hold`.

## SMC engine

`app/analysis/smc_engine.py` exposes:

- `detect_structure`
- `detect_order_blocks`
- `detect_fvg`
- `detect_liquidity`
- `detect_pd_zones`
- `compute_indicators`

## CORS

CORS is open (`allow_origins=["*"]`) for local development.
