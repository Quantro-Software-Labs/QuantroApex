# QuantroApex Data Pipeline

High-performance Python service for **pre-training market data ingestion**, **real-time streaming**, **strategy labelling**, and **Global Brain foundation model training**.

Default port: **8002**

---

## ⚡ Overview

The Data Pipeline service ingest historical OHLCV data across asset classes (Crypto, Stocks, Forex), streams real-time WebSockets, applies VectorBT strategy labelling, trains PyTorch-based RL/Transformer foundation models, and serves data queries via FastAPI.

---

## 🛠️ Setup & Installation

### 1. Prerequisites

- **Python**: `>= 3.11`
- **Database**: PostgreSQL with optional TimescaleDB extension

### 2. Environment Setup

From the repository root or inside `services/data-pipeline/`:

```bash
cd services/data-pipeline
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install --default-timeout=1000 -r requirements-train.txt
```

### 3. Execution Commands

- **Stocks**: Data ingested via `yfinance` (no API key required).
- **Forex**: Ingested via Twelve Data (set `TWELVEDATA_API_KEY`).
- **Crypto**: Ingested via public feeds.

```bash
# Full automated setup & initial run
python main.py setup
python main.py all
```

---

## 🐳 Docker Deployment

```bash
# One-shot data setup profile
docker compose --profile data-setup run --rm data-pipeline-setup

# Continuous service execution
docker compose --profile data-pipeline up -d data-pipeline
```

---

## ⚙️ Service Modes

| Mode | Command | Description |
|------|---------|-------------|
| **setup** | `python main.py setup` | Executes schema migration, historical ingest, labelling, and training |
| **stream** | `python main.py stream` | Ingests live WebSocket & poll feeds into PostgreSQL |
| **api** | `python main.py api` | Starts FastAPI query server on port `:8002` |
| **label** | `python main.py label` | Re-runs VectorBT strategy labelling suite |
| **train** | `python main.py train` | Trains/fine-tunes the Global Brain model |
| **evaluate** | `python main.py evaluate` | Evaluates model walk-forward performance vs EMA/RSI baselines |
| **all** | `python main.py all` | Starts stream + api concurrently (Production Default) |

### CLI Options

- `python main.py setup --skip-ingest --skip-label`
- `python main.py evaluate --holdout 0.2 --folds 3 --min-win-prob 0.55`

---

## 📊 TimescaleDB Setup

If using Supabase or self-hosted PostgreSQL, enable TimescaleDB hyper-tables:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

*Note: If TimescaleDB is absent, the system automatically falls back to standard PostgreSQL indexed tables.*

---

## 📌 API Endpoints (`:8002`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Ingestion status & database connectivity |
| `GET` | `/market-data/{symbol}/{timeframe}?limit=200` | Historical OHLCV candles |
| `GET` | `/symbols/{asset_class}` | List supported symbols per asset class |
| `GET` | `/features/{symbol}/{timeframe}` | Calculated indicator features for ML |
| `GET` | `/stats` | Pipeline performance metrics & bar counts |

*Symbol tip: Use hyphenated format for symbols (e.g., `BTC-USDT` is mapped to `BTC/USDT`).*
