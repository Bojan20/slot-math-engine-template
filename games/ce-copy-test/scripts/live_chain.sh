#!/bin/bash
# CE COPY TEST — LIVE progress chain runner.
#
# Vrti svih 3 SWID-a sekvencijalno, ali svakih 5 sekundi piše live red u
# `reports/10b/LIVE.log` sa: vreme | SWID | elapsed | CPU% | procenat | ETA.
# Boki gleda sa `tail -f games/ce-copy-test/reports/10b/LIVE.log`.
# Kad SVE 3 + aggregate završe — finalni "🏁 DONE" red u LIVE log + macOS
# notifikacija na desktop.
#
# Zero chat poruka. Sve real-time u tail-able log.

set -u
cd "$(dirname "$0")/.."

LIVE="reports/10b/LIVE.log"
LIVE_DIR="$(dirname "$LIVE")"
BIN="engine-rust/target/release/ce-sim"
EST_TOTAL_SEC=1800   # ~30 min per 10B run on 10 cores

mkdir -p "$LIVE_DIR"
: > "$LIVE"   # truncate, start fresh

now() { date '+%H:%M:%S'; }

log() { echo "[$(now)] $1" >> "$LIVE"; }

notify() {
    /usr/bin/osascript -e "display notification \"$1\" with title \"CE-COPY-TEST live\"" 2>/dev/null || true
}

# Convert "MM:SS" or "HH:MM:SS" to seconds.
etime_to_sec() {
    awk -F: '{
        if (NF==2) print $1*60 + $2
        else if (NF==3) print $1*3600 + $2*60 + $3
        else print 0
    }'
}

run_one() {
    local swid="$1"
    local log_path="reports/10b/ce-10b.${swid}.log"
    log "🚀 START ${swid} (10B spinova, bet mult 1)"
    "$BIN" --ir "out/ce-copy-test.${swid}.ir.json" --spins 10000000000 --bet-mult 1 > "$log_path" 2>&1 &
    local pid=$!
    log "   PID=$pid  est_duration=${EST_TOTAL_SEC}s  (~30 min)"
    notify "${swid} started"
    local last_progress=-1
    while kill -0 "$pid" 2>/dev/null; do
        local etime pcpu et_sec pct remain
        etime="$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ' || echo 0:0)"
        pcpu="$(ps -p "$pid" -o pcpu= 2>/dev/null | tr -d ' ' || echo 0)"
        et_sec="$(echo "$etime" | etime_to_sec)"
        pct=$((et_sec * 100 / EST_TOTAL_SEC))
        remain=$((EST_TOTAL_SEC - et_sec))
        if [[ "$remain" -lt 0 ]]; then remain=0; fi
        # Update only every 5 sec OR when percent changes by 1+
        if [[ "$pct" -ne "$last_progress" ]] || (( et_sec % 5 == 0 )); then
            log "   ⏳ ${swid} elapsed=${etime}  cpu=${pcpu}%  ~${pct}%  ETA=${remain}s"
            last_progress="$pct"
        fi
        sleep 5
    done
    local size="$(wc -c < "$log_path" 2>/dev/null || echo 0)"
    if grep -q "Total RTP" "$log_path" 2>/dev/null; then
        local rtp_line
        rtp_line="$(grep 'Total RTP' "$log_path" | head -1)"
        log "✅ ${swid} DONE  log=${size}B  | ${rtp_line}"
        notify "${swid} DONE"
    else
        log "💥 ${swid} CRASHED  log=${size}B"
        notify "${swid} CRASHED"
        return 1
    fi
}

log "════════════════════════════════════════════════════════════════"
log "CE COPY TEST — LIVE chain start"
log "Output:   $LIVE"
log "Pratiti:  tail -f games/ce-copy-test/reports/10b/LIVE.log"
log "════════════════════════════════════════════════════════════════"

for swid in 200-1637-001 200-1637-002 200-1637-003; do
    run_one "$swid"
done

log "📊 aggregating PAR_100spins targets..."
python3 scripts/aggregate_10b.py >> "$LIVE" 2>&1
log "🏁 ALL DONE — see reports/par-verification-10b.md"
notify "🏁 30B verifikacija ZAVRŠENA"
