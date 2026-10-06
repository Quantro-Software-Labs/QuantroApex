# QuantroApex AI Service

Python FastAPI microservice for **Smart Money Concepts (SMC)** analysis, **TA-Lib** technical indicators/pattern detection, and **VectorBT** strategy backtesting.

Default port: **8001**

---

## ⚡ Overview

The AI Service processes market candles to detect institutional order flow setups:
- **Order Blocks (OB)**: Bullish & Bearish order blocks with volume confirmation.
- **Fair Value Gaps (FVG)**: Imbalance zone detection.
- **Break of Structure (BOS) & Change of Character (CHoCH)**: Market structure break identification.
- **Liquidity Pools**: Buy-side and sell-side liquidity sweep zones.
- **Premium / Discount Zones**: Equilibrium calculations based on recent swing highs and lows.
- **TA-Lib & VectorBT**: 60+ candlestick pattern recognitions and historical vector backtests.

---

## 🛠️ Prerequisites & Setup

### 1. System TA-Lib (Recommended)

The Python `TA-Lib` wrapper requires the underlying C library:

```bash
# Ubuntu / Debian
sudo apt-get install -y build-essential wget
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz
cd ta-lib/
./configure --prefix=/usr
make && sudo make install

# macOS
brew install ta-lib
```

*Note: If system TA-Lib is not installed, the AI Service operates in **Degraded Mode** using pandas-based indicator fallbacks.*

### 2. Environment Setup

```bash
cd services/ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Optionally install advanced packages when environment permits:
```bash
pip install TA-Lib vectorbt 'plotly>=5.18.0,<6'
```

### 3. Market Data Credentials (Optional)

Configure Alpaca credentials for direct live candle streaming:
```bash
export ALPACA_API_KEY="your-key"
export ALPACA_SECRET_KEY="your-secret"
```

---

## 🚀 Running the Service

- **Standalone via uvicorn**:
  ```bash
  cd services/ai-service
  source .venv/bin/activate
  uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
  ```
- **Monorepo command**:
  ```bash
  npm run ai:dev
  ```

Interactive OpenAPI documentation: [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 📌 API Endpoints Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check & TA-Lib / VectorBT feature flags |
| `GET` | `/analysis/{asset_class}/{symbol}/{timeframe}` | SMC overlays + RSI / MACD / EMA calculations |
| `POST` | `/backtest` | VectorBT strategy backtest engine |
| `GET` | `/patterns/list` | Available TA-Lib pattern identifiers |
| `POST` | `/patterns/detect` | Detect candlestick patterns on custom OHLCV data |

---

## 🧪 Testing

```bash
cd services/ai-service
pytest
```
