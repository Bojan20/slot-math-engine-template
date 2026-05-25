#!/bin/bash
# CE COPY TEST — orchestrator koji pokreće 10B PAR-002 i 10B PAR-003
# nakon što trenutni PAR-001 proces (PID provided) završi, pa generiše
# final aggregate report.

set -euo pipefail
cd "$(dirname "$0")/.."

PAR001_PID="${1:-}"
SPINS="${SPINS:-10000000000}"
BM="${BM:-1}"
BIN="engine-rust/target/release/ce-sim"
mkdir -p reports/10b

# Wait for PAR-001 to finish if PID provided
if [[ -n "$PAR001_PID" ]]; then
    echo "[$(date +%H:%M:%S)] Waiting on PAR-001 PID $PAR001_PID..."
    while kill -0 "$PAR001_PID" 2>/dev/null; do
        sleep 30
    done
    echo "[$(date +%H:%M:%S)] PAR-001 process exited."
fi

# Copy /tmp log into reports/10b if applicable
if [[ -s /tmp/ce-10b-001.log ]] && [[ ! -s reports/10b/ce-10b.200-1637-001.log ]]; then
    cp /tmp/ce-10b-001.log reports/10b/ce-10b.200-1637-001.log
    echo "[$(date +%H:%M:%S)] Copied PAR-001 log to reports/10b/"
fi

# Run remaining SWID-s sequentially
for SWID in 200-1637-002 200-1637-003; do
    LOG="reports/10b/ce-10b.${SWID}.log"
    if [[ -s "$LOG" ]] && tail -3 "$LOG" | grep -q "1000x+"; then
        echo "[$(date +%H:%M:%S)] $SWID already complete — skipping"
        continue
    fi
    echo "[$(date +%H:%M:%S)] Running $SWID (10B spinova, bet mult $BM)..."
    "$BIN" \
        --ir "out/ce-copy-test.${SWID}.ir.json" \
        --spins "$SPINS" \
        --bet-mult "$BM" \
        > "$LOG" 2>&1
    echo "[$(date +%H:%M:%S)] $SWID done."
done

# Final aggregate
echo "[$(date +%H:%M:%S)] Generating final aggregate report..."
python3 scripts/aggregate_10b.py

echo "[$(date +%H:%M:%S)] ALL DONE. See reports/par-verification-10b.md"
ls -lh reports/10b/ reports/par-verification-10b.md reports/par-verification-10b.json
