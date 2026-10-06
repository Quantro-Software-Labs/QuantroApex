#!/bin/bash
# Persistent launcher for the paper trader process.
# Run with: bash start_paper.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/.venv/bin/python3"
LOG="$SCRIPT_DIR/logs/paper.log"
PID_FILE="$SCRIPT_DIR/paper.pid"
export PYTHONUNBUFFERED=1

if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null && echo "Stopped old PID $OLD_PID" || true
    rm -f "$PID_FILE"
fi
pkill -f "main.py paper" 2>/dev/null || true
sleep 1

mkdir -p "$SCRIPT_DIR/logs"
cd "$SCRIPT_DIR"
nohup "$PYTHON" main.py paper > "$LOG" 2>&1 &
echo $! > "$PID_FILE"
echo "Paper trader started — PID: $(cat $PID_FILE)"
echo "Log: $LOG"
