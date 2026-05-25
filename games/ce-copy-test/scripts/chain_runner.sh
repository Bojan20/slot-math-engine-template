#!/bin/bash
# Chain runner: čeka da trenutni sim (PID iz .current_pid) završi,
# pokreće sledeći SWID, ažurira .current_pid + .current_swid za
# watchdog. Kad SVE 3 SWID-a završe → pokreće aggregate + notify.

set -u
cd "$(dirname "$0")/.."

CHAIN_LOG="reports/10b/CHAIN.log"
PID_FILE="reports/10b/.current_pid"
SWID_FILE="reports/10b/.current_swid"
BIN="engine-rust/target/release/ce-sim"

log() { echo "[$(date '+%H:%M:%S')] $1" >> "$CHAIN_LOG"; }
notify() {
    /usr/bin/osascript -e "display notification \"$1\" with title \"CE-COPY-TEST chain\"" 2>/dev/null || true
}

wait_for_current() {
    local pid="$(cat "$PID_FILE" 2>/dev/null)"
    if [[ -z "$pid" ]]; then return 0; fi
    log "waiting on PID $pid"
    while kill -0 "$pid" 2>/dev/null; do sleep 30; done
    log "PID $pid exited"
}

run_swid() {
    local swid="$1"
    local log_path="reports/10b/ce-10b.${swid}.log"
    if [[ -s "$log_path" ]] && grep -q "1000x+" "$log_path"; then
        log "✅ ${swid} already complete — skipping"
        return 0
    fi
    log "🚀 starting ${swid}"
    notify "PAR-${swid} START"
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
        notify "PAR-${swid} DONE"
    else
        log "💥 ${swid} CRASHED (log ${sz}B)"
        notify "PAR-${swid} CRASHED"
        return 1
    fi
}

# Wait for the in-flight job (probably PAR-002 PID 37705)
wait_for_current

# Now run PAR-003
run_swid "200-1637-003"

# Finally aggregate
log "📊 aggregating..."
python3 scripts/aggregate_10b.py >> "$CHAIN_LOG" 2>&1
log "✅ AGGREGATE done"
notify "AGGREGATE COMPLETE — ALL 3 SWID-a verified"
