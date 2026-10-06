# QuantroApex Quant Engine (Legacy)

> ⚠️ **Notice:** This package is retained for legacy compatibility. Active Smart Money Concepts (SMC), TA-Lib, and VectorBT processing have been migrated to [`services/ai-service`](../ai-service/) running on port `:8001`.

FastAPI service for **TA-Lib** candlestick pattern recognition and **VectorBT** backtesting.

Default port: **8001**

---

## 🛠️ Prerequisites & Installation

### System TA-Lib

```bash
# Debian / Ubuntu
sudo apt-get install -y build-essential wget
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz
cd ta-lib/
./configure --prefix=/usr
make && sudo make install

# macOS
brew install ta-lib
```

---

## 🚀 Setup & Run

```bash
cd services/quant-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Interactive API documentation available at: [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 📌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness & TA-Lib availability check |
| `GET` | `/patterns/list` | List available TA-Lib pattern keys |
| `POST` | `/patterns/detect` | Run pattern detection on OHLCV candles |
| `POST` | `/backtest/run` | Execute SMA Crossover, RSI, or Buy-Hold backtest |
