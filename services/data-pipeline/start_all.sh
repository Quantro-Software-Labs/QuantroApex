#!/bin/bash
# Persistent launcher for the complete data pipeline (stream + API + paper trader).
# Run with: bash start_all.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/.venv/bin/python3"
LOG="$SCRIPT_DIR/logs/pipeline.log"
PID_FILE="$SCRIPT_DIR/pipeline.pid"
export PYTHONUNBUFFERED=1

if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null && echo "Stopped old PID $OLD_PID" || true
    rm -f "$PID_FILE"
fi
pkill -f "main.py all" 2>/dev/null || true
pkill -f "main.py api" 2>/dev/null || true
pkill -f "main.py stream" 2>/dev/null || true
pkill -f "main.py paper" 2>/dev/null || true
sleep 1

mkdir -p "$SCRIPT_DIR/logs"
cd "$SCRIPT_DIR"
nohup "$PYTHON" main.py all > "$LOG" 2>&1 &
echo $! > "$PID_FILE"
echo "QuantroApex Data Pipeline started (stream + API + paper) — PID: $(cat $PID_FILE)"
echo "Log: $LOG"
