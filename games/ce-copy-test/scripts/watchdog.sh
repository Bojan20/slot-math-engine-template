#!/bin/bash
# Watchdog koji svake minute zapisuje DA LI procesi rade, koliko su daleko,
# i kada nešto pukne — odmah piše ALERT u log + macOS notification.
#
# Bez ovoga gubim kontekst čim minu 5 min. Sa ovim mogu uvek `tail -5
# reports/10b/WATCHDOG.log` da vidim stvarno stanje.

set -u
cd "$(dirname "$0")/.."

WD_LOG="reports/10b/WATCHDOG.log"
PID_FILE="reports/10b/.current_pid"
SWID_FILE="reports/10b/.current_swid"

mkdir -p reports/10b

notify() {
    local msg="$1"
    /usr/bin/osascript -e "display notification \"$msg\" with title \"CE-COPY-TEST watchdog\"" 2>/dev/null || true
}

log() {
    echo "[$(date '+%H:%M:%S')] $1" >> "$WD_LOG"
}

# Read current job state
CURRENT_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
CURRENT_SWID="$(cat "$SWID_FILE" 2>/dev/null || echo "")"

if [[ -z "$CURRENT_PID" || -z "$CURRENT_SWID" ]]; then
    log "no current job tracked"
    exit 0
fi

if kill -0 "$CURRENT_PID" 2>/dev/null; then
    ETIME="$(ps -p "$CURRENT_PID" -o etime= 2>/dev/null | tr -d ' ')"
    PCPU="$(ps -p "$CURRENT_PID" -o pcpu= 2>/dev/null | tr -d ' ')"
    LOG_SIZE="$(wc -c < "reports/10b/ce-10b.${CURRENT_SWID}.log" 2>/dev/null || echo 0)"
    log "alive ${CURRENT_SWID} PID=${CURRENT_PID} etime=${ETIME} cpu=${PCPU}% logsize=${LOG_SIZE}"
else
    LOG="reports/10b/ce-10b.${CURRENT_SWID}.log"
    LOG_SIZE="$(wc -c < "$LOG" 2>/dev/null || echo 0)"
    if [[ "$LOG_SIZE" -gt 1000 ]] && grep -q "Total RTP" "$LOG"; then
        log "✅ COMPLETED ${CURRENT_SWID} log=${LOG_SIZE}B"
        notify "PAR-${CURRENT_SWID} DONE"
        # Clear pid file so next watchdog tick sees no current job
        > "$PID_FILE"
        > "$SWID_FILE"
    else
        log "💥 ALERT ${CURRENT_SWID} PID=${CURRENT_PID} dead but log only ${LOG_SIZE}B"
        notify "PAR-${CURRENT_SWID} CRASHED"
        > "$PID_FILE"
        > "$SWID_FILE"
    fi
fi
