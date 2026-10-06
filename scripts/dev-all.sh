#!/usr/bin/env bash
# Start QuantroApex Services (API Gateway :3000, AI Service :8001, Data Pipeline :8002, Trader Web :3001)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_WEB=false
WITH_MOBILE=false

for arg in "$@"; do
  case "$arg" in
    --with-web) WITH_WEB=true ;;
    --with-mobile) WITH_MOBILE=true ;;
  esac
done

PIDS=()

cleanup() {
  echo ""
  echo "Shutting down QuantroApex dev services..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "================================================================="
echo "  QuantroApex Autonomous AI Trading System — Development Launcher"
echo "================================================================="
echo "  • API Gateway:   http://localhost:3000"
echo "  • AI Service:    http://localhost:8001"
echo "  • Data Pipeline: http://localhost:8002"
if [ "$WITH_WEB" = true ]; then
  echo "  • Trader Web:    http://localhost:3001"
fi
if [ "$WITH_MOBILE" = true ]; then
  echo "  • Mobile Web:    http://localhost:8080"
fi
echo "================================================================="

# Free stale listeners from a previous run
for port in 3000 8001 8002 3001 8080; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi
done
pkill -f "tsx watch src/index.ts" >/dev/null 2>&1 || true
pkill -f "uvicorn app.main:app" >/dev/null 2>&1 || true
pkill -f "python main.py all" >/dev/null 2>&1 || true
pkill -f ".venv/bin/python main.py all" >/dev/null 2>&1 || true
sleep 1

# 1. Start API Gateway
npm run dev &
PIDS+=($!)

# 2. Start AI Service
if [[ -x "$ROOT/services/ai-service/.venv/bin/uvicorn" ]]; then
  npm run ai:dev &
  PIDS+=($!)
elif command -v uvicorn >/dev/null 2>&1; then
  (cd "$ROOT/services/ai-service" && uvicorn app.main:app --reload --port 8001) &
  PIDS+=($!)
else
  echo "Warning: Python uvicorn not found for ai-service. Run setup in services/ai-service first."
fi

# 3. Start Data Pipeline
if [[ -x "$ROOT/services/data-pipeline/.venv/bin/python" ]]; then
  (cd "$ROOT/services/data-pipeline" && .venv/bin/python main.py all) &
  PIDS+=($!)
elif command -v python3 >/dev/null 2>&1; then
  (cd "$ROOT/services/data-pipeline" && python3 main.py all) &
  PIDS+=($!)
else
  echo "Warning: Python not found for data-pipeline."
fi

# 4. Optional Trader Web desktop app
if [ "$WITH_WEB" = true ]; then
  (cd "$ROOT/apps/trader-web" && pnpm dev) &
  PIDS+=($!)
fi

# 5. Optional Mobile Web app
if [ "$WITH_MOBILE" = true ]; then
  (cd "$ROOT/apps/mobile" && flutter run -d web-server --web-port 8080 --web-hostname 0.0.0.0) &
  PIDS+=($!)
fi

echo "All services launched cleanly. Background PIDs: ${PIDS[*]}"
echo "Press Ctrl+C to stop all."
wait
