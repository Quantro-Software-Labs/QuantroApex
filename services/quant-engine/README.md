# Quant Engine

> **Deprecated:** use [`services/ai-service`](../ai-service/) (SMC + TA-Lib + VectorBT on port 8001). This package can be removed once callers switch.

FastAPI service for **TA-Lib** candlestick pattern recognition and **VectorBT** backtesting.

Default port: **8001**

## Prerequisites

### System TA-Lib (required for full pattern mode)

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

If the C library is missing, the service still starts in **degraded mode** using simple pandas pattern stubs (labeled in API responses). Install the system package for real TA-Lib signals.

## Setup

```bash
cd services/quant-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
cd services/quant-engine
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Or:

```bash
python -m app.main
```

Open docs: http://localhost:8001/docs

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness + TA-Lib / VectorBT availability |
| `GET` | `/patterns/list` | Available CDL* pattern names |
| `POST` | `/patterns/detect` | Detect patterns on OHLCV candles |
| `POST` | `/backtest/run` | Run SMA crossover / RSI / buy-hold backtest |

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

Response includes `index`, `name`, `signal` (−100 / 0 / 100 style). In degraded mode, detections also set `"degraded": true`.

### Run backtest

```bash
curl -s http://localhost:8001/backtest/run \
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

Returns `total_return`, `sharpe`, `max_drawdown`, `win_rate`, sampled `equity_curve`, and `trades` count.

## CORS

CORS is open (`allow_origins=["*"]`) for local development.
