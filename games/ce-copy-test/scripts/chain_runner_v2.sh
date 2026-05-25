#!/bin/bash
# Chain runner v2 — full 3-SWID 10B re-run posle avg_fs_bonus bug fix-a.
# Pokreće SWID-ove sekvencijalno (jedan po jedan), aggregate na kraju.

set -u
cd "$(dirname "$0")/.."

CHAIN_LOG="reports/10b/CHAIN.v2.log"
PID_FILE="reports/10b/.current_pid"
SWID_FILE="reports/10b/.current_swid"
BIN="engine-rust/target/release/ce-sim"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$CHAIN_LOG"; }
notify() {
    /usr/bin/osascript -e "display notification \"$1\" with title \"CE-COPY-TEST chain v2\"" 2>/dev/null || true
}

run_swid() {
    local swid="$1"
    local log_path="reports/10b/ce-10b.${swid}.log"
    log "🚀 starting ${swid}"
    notify "${swid} START"
    "$BIN" --ir "out/ce-copy-test.${swid}.ir.json" \
        --spins 10000000000 --bet-mult 1 \
        > "$log_path" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    echo "$swid" > "$SWID_FILE"
    log "  PID=$pid"
    while kill -0 "$pid" 2>/dev/null; do sleep 30; done
    local sz="$(wc -c < "$log_path")"
    if grep -q "Total RTP" "$log_path"; then
        log "✅ ${swid} COMPLETED (log ${sz}B)"
        notify "${swid} DONE"
    else
        log "💥 ${swid} CRASHED (log ${sz}B)"
        notify "${swid} CRASHED"
        return 1
    fi
}

log "=== CHAIN v2 START — post avg_fs_bonus fix ==="

for swid in 200-1637-001 200-1637-002 200-1637-003; do
    run_swid "$swid" || exit 1
done

log "📊 aggregating..."
python3 scripts/aggregate_10b.py >> "$CHAIN_LOG" 2>&1
log "✅ AGGREGATE done"
notify "ALL 3 SWID-a 10B verified post-fix"
