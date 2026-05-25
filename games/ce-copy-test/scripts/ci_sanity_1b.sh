#!/usr/bin/env bash
# CE COPY TEST — 1B sanity gate za CI.
#
# Pokreće 1B spinova × 3 SWID × bet-mult=1 (~3 min per SWID na 5.5M spins/sec).
# Aggregate-uje protiv Excel PAR-a; FAILS ako bilo koja Excel-objavljena
# metrika ima |Δ| ≥ 0.5 % (verdict ❌ u aggregate). Trigger frequencies
# threshold je 0.2% (one-in-N varijabilnost je veća na 1B).
#
# Exit codes:
#   0 — sve metrike unutar tolerance
#   1 — bar 1 metrika preko threshold-a
#   2 — sim crash / log corrupt
#
# Usage:
#   scripts/ci_sanity_1b.sh                    # default 1B per SWID
#   scripts/ci_sanity_1b.sh --spins 500000000  # 500M per SWID (~1.5 min)
#   scripts/ci_sanity_1b.sh --swids "200-1637-001"  # subset
#
# Pokreni iz CI:
#   ce-copy-test/scripts/ci_sanity_1b.sh

set -euo pipefail
cd "$(dirname "$0")/.."

SPINS="${SPINS:-1000000000}"   # 1B default
SWIDS_CSV="200-1637-001,200-1637-002,200-1637-003"
TOL_RTP_PCT="0.5"
TOL_TRIGGER_PCT="2.0"

while [ $# -gt 0 ]; do
  case "$1" in
    --spins)      SPINS="$2"; shift 2 ;;
    --swids)      SWIDS_CSV="$2"; shift 2 ;;
    --tol-rtp)    TOL_RTP_PCT="$2"; shift 2 ;;
    --tol-trig|--tol-trigger)   TOL_TRIGGER_PCT="$2"; shift 2 ;;
    --help|-h)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

IFS=',' read -r -a SWIDS <<< "$SWIDS_CSV"

OUT_DIR="reports/ci-sanity-1b"
SANITY_LOG="$OUT_DIR/SANITY.log"
BIN="engine-rust/target/release/ce-sim"

mkdir -p "$OUT_DIR"
: > "$SANITY_LOG"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$SANITY_LOG"; }

if [ ! -x "$BIN" ]; then
  log "🔨 building ce-sim (release)..."
  (cd engine-rust && cargo build --release --bin ce-sim --quiet)
fi

log "=== CI SANITY 1B — ${#SWIDS[@]} SWID-a × ${SPINS} spinova ==="
log "  Tolerance: RTP ${TOL_RTP_PCT}%, triggers ${TOL_TRIGGER_PCT}%"
log ""

FAIL=0

for swid in "${SWIDS[@]}"; do
  cell_log="$OUT_DIR/sanity-${swid}.log"
  log "🚀 ${swid}"
  t0="$(date +%s)"
  if ! "$BIN" --ir "out/ce-copy-test.${swid}.ir.json" \
              --spins "$SPINS" --bet-mult 1 \
              > "$cell_log" 2>&1; then
    log "  ❌ ${swid} CRASHED"
    FAIL=$(( FAIL + 1 ))
    continue
  fi
  sec=$(( $(date +%s) - t0 ))

  if ! grep -q "Total RTP" "$cell_log"; then
    log "  ❌ ${swid} log incomplete after ${sec}s"
    FAIL=$(( FAIL + 1 ))
    continue
  fi
  log "  ✅ ${swid} sim ok in ${sec}s"
done

if [ "$FAIL" -gt 0 ]; then
  log ""
  log "💥 SANITY FAILED — ${FAIL} sim crash/incomplete"
  exit 2
fi

log ""
log "📊 verdict check (RTP tol ${TOL_RTP_PCT}%, trigger tol ${TOL_TRIGGER_PCT}%)..."

# Use the existing aggregator for diff against Excel.
if ! python3 scripts/ci_sanity_check.py \
       --logs "$OUT_DIR" \
       --swids "$SWIDS_CSV" \
       --tol-rtp "$TOL_RTP_PCT" \
       --tol-trigger "$TOL_TRIGGER_PCT" \
       >> "$SANITY_LOG" 2>&1; then
  log "❌ SANITY GATE FAIL — see ${SANITY_LOG}"
  cat "$SANITY_LOG" | tail -30
  exit 1
fi

log "🏁 CI SANITY PASS"
exit 0
