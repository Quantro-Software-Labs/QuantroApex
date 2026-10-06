#!/bin/bash
# Persistent launcher for the data pipeline stream process.
# Run with: bash start_stream.sh
# Survives terminal close; writes PID to stream.pid for monitoring.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/.venv/bin/python3"
LOG="$SCRIPT_DIR/logs/pipeline.log"
PID_FILE="$SCRIPT_DIR/stream.pid"
export PYTHONUNBUFFERED=1

# Kill any existing instance
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null && echo "Stopped old PID $OLD_PID" || true
    rm -f "$PID_FILE"
fi
pkill -f "main.py stream" 2>/dev/null || true
sleep 1

cd "$SCRIPT_DIR"
nohup "$PYTHON" main.py stream > "$LOG" 2>&1 &
echo $! > "$PID_FILE"
echo "Pipeline stream started — PID: $(cat $PID_FILE)"
echo "Log: $LOG"
