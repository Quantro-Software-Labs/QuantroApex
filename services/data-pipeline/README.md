# QuantroApex Data Pipeline
#
# Pre-training market data ingestion, real-time streaming, strategy labelling,
# and Global Brain foundation model training.
#
# ## Quick start (local)
#
# ```bash
# # From repo root — ensure DATABASE_URL / DIRECT_URL (session pooler) + TWELVEDATA_API_KEY
# cd services/data-pipeline
# python -m venv .venv && source .venv/bin/activate
# pip install -r requirements.txt
# pip install --default-timeout=1000 -r requirements-train.txt
#
# # Stocks = yfinance (no key). Forex = Twelve Data (set TWELVEDATA_API_KEY).
# python main.py setup
# python main.py all
# ```
#
# Crypto already ingested is skipped via `ingestion_log`. Existing crypto
# labelled samples are preserved; stocks/forex strategies are labelled fresh.
# Prior `global_brain_latest.pt` is archived as `global_brain_crypto_only_*.pt`.
#
# ## Docker
#
# ```bash
# # One-shot setup profile
# docker compose --profile data-setup run --rm data-pipeline-setup
#
# # Continuous service
# docker compose --profile data-pipeline up -d data-pipeline
# ```
#
# ## Modes
#
# | Mode     | Purpose                                      |
# |----------|----------------------------------------------|
# | setup    | Schema + historical ingest + label + train   |
# | stream   | Live WebSocket / poll feeds into DB          |
# | api      | FastAPI query layer on port 8002             |
# | label    | Re-run VectorBT labelling only               |
# | train    | Re-train Global Brain only                   |
# | evaluate | Time holdout + walk-forward vs EMA/RSI       |
# | all      | stream + api (production default)            |
#
# Flags for setup: `--skip-ingest`, `--skip-label`, `--skip-train`, `--epochs N`
# Evaluate: `python main.py evaluate` → writes `checkpoints/eval_report.json`
# Optional: `--holdout 0.2 --folds 3 --min-win-prob 0.55 --checkpoint PATH`
#
# ## TimescaleDB
#
# On Supabase (Pro), run once in the SQL editor:
# ```sql
# CREATE EXTENSION IF NOT EXISTS timescaledb;
# ```
# Without TimescaleDB the service falls back to plain Postgres tables.
#
# ## API
#
# - `GET /health`
# - `GET /market-data/{symbol}/{timeframe}?limit=200`
# - `GET /symbols/{asset_class}`
# - `GET /features/{symbol}/{timeframe}`
# - `GET /stats`
#
# Symbol tip: use `BTC-USDT` in URLs (converted to `BTC/USDT`).
