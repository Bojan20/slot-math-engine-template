#!/bin/bash
# CE COPY TEST — 10B spinova verifikacija svih 3 SWID-a sekvencijalno.
#
# Ne dozvoljava paralelne run-ove (jedan ce-sim već koristi sve 8 threads).
# Output se čuva u reports/10b/ce-10b.<swid>.log + reports/10b/ce-10b.<swid>.txt
#
# Trajanje: ~28 min per SWID × 3 SWID = ~85 min ukupno.

set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p reports/10b

BIN="engine-rust/target/release/ce-sim"
[[ -x "$BIN" ]] || { echo "ERR: $BIN missing — run cargo build --release first"; exit 1; }

SPINS=10000000000
BM=1

for SWID in 200-1637-001 200-1637-002 200-1637-003; do
    LOG="reports/10b/ce-10b.${SWID}.log"
    if [[ -s "$LOG" ]] && tail -1 "$LOG" | grep -q "1000x+"; then
        echo "[$(date +%H:%M:%S)] $SWID already complete — skipping"
        continue
    fi
    echo "[$(date +%H:%M:%S)] Running $SWID  (10B spinova, bet mult 1)..."
    "$BIN" \
        --ir "out/ce-copy-test.${SWID}.ir.json" \
        --spins "$SPINS" \
        --bet-mult "$BM" \
        > "$LOG" 2>&1
    echo "[$(date +%H:%M:%S)] $SWID done."
done

echo "[$(date +%H:%M:%S)] All 3 SWID-a verified."
ls -lh reports/10b/
