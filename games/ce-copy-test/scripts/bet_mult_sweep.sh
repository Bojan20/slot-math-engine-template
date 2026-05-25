#!/usr/bin/env bash
# CE COPY TEST — bet-mult sweep runner.
#
# Run all 3 SWID-ova × {1, 2, 5, 10} bet multiplier-a. Matrix 3×4 = 12 sim-ova.
# Po default-u 1B spinova per cell (~3 min @ 5.5M spins/sec) — ukupno ~36 min.
# Output: reports/sweep-bet-mult/<swid>-bm<N>.log + matrica MD + JSON.
#
# Razlog: 30B verifikacija je odrađena samo na bet-mult=1. Excel PAR samo
# objavljuje bet-mult=1, ali svi viši bet-mult-ovi koriste isti math —
# treba dokazati da CE pattern weights skaliraju identično za sve BM-ove
# (tj. da je RTP invarijantan po bet-mult-u na nivou 0.5%).
#
# Usage:
#   scripts/bet_mult_sweep.sh                          # default 1B per cell
#   scripts/bet_mult_sweep.sh --spins 10000000000     # 10B per cell (slow!)
#   scripts/bet_mult_sweep.sh --bet-mults "1,2,5,10,20"
#   scripts/bet_mult_sweep.sh --swids "200-1637-001"  # just one SWID
#   scripts/bet_mult_sweep.sh --seq                    # sequential (default)
#   scripts/bet_mult_sweep.sh --par 2                  # 2-wide parallel (cargo CPU-saturated!)

set -euo pipefail
cd "$(dirname "$0")/.."

SPINS="${SPINS:-1000000000}"   # 1B per cell default
# Default seed = 0xCEC0C0FE = 3468624126 — clap parses decimal only.
SEED="${SEED:-3468624126}"
BET_MULTS_CSV="1,2,5,10"
SWIDS_CSV="200-1637-001,200-1637-002,200-1637-003"
PARALLEL=1                      # how many sims run concurrently (1 = serial)

while [ $# -gt 0 ]; do
  case "$1" in
    --spins)      SPINS="$2"; shift 2 ;;
    --seed)       SEED="$2"; shift 2 ;;
    --bet-mults)  BET_MULTS_CSV="$2"; shift 2 ;;
    --swids)      SWIDS_CSV="$2"; shift 2 ;;
    --par)        PARALLEL="$2"; shift 2 ;;
    --seq)        PARALLEL=1; shift ;;
    --help|-h)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

IFS=',' read -r -a SWIDS <<< "$SWIDS_CSV"
IFS=',' read -r -a BMS <<< "$BET_MULTS_CSV"

OUT_DIR="reports/sweep-bet-mult"
CHAIN_LOG="$OUT_DIR/SWEEP.log"
BIN="engine-rust/target/release/ce-sim"

mkdir -p "$OUT_DIR"
: > "$CHAIN_LOG"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$CHAIN_LOG"; }

if [ ! -x "$BIN" ]; then
  log "🔨 building ce-sim (release)..."
  (cd engine-rust && cargo build --release --bin ce-sim --quiet)
fi

TOTAL_CELLS=$(( ${#SWIDS[@]} * ${#BMS[@]} ))
log "=== BET-MULT SWEEP START — $TOTAL_CELLS cells × ${SPINS} spinova ==="
log "  SWIDs:     ${SWIDS_CSV}"
log "  Bet mults: ${BET_MULTS_CSV}"
log "  Parallel:  $PARALLEL"
log ""

run_cell() {
  local swid="$1" bm="$2"
  local cell_log="$OUT_DIR/${swid}-bm${bm}.log"
  log "🚀 ${swid} × bet-mult=${bm}"
  local t0; t0="$(date +%s)"
  if "$BIN" --ir "out/ce-copy-test.${swid}.ir.json" \
            --spins "$SPINS" --bet-mult "$bm" --seed "$SEED" \
            > "$cell_log" 2>&1; then
    local sec=$(( $(date +%s) - t0 ))
    if grep -q "Total RTP" "$cell_log"; then
      log "  ✅ ${swid} bm=${bm} done in ${sec}s"
    else
      log "  💥 ${swid} bm=${bm} log incomplete after ${sec}s"
    fi
  else
    log "  ❌ ${swid} bm=${bm} CRASHED"
  fi
}

# Sequential or limited parallel. Default 1 since each ce-sim already eats
# all cores via rayon — running multiple cells in parallel only helps if
# you cap rayon threads per-cell (out of scope here).
ACTIVE=0
for swid in "${SWIDS[@]}"; do
  for bm in "${BMS[@]}"; do
    if [ "$PARALLEL" -gt 1 ]; then
      run_cell "$swid" "$bm" &
      ACTIVE=$(( ACTIVE + 1 ))
      if [ "$ACTIVE" -ge "$PARALLEL" ]; then
        wait -n
        ACTIVE=$(( ACTIVE - 1 ))
      fi
    else
      run_cell "$swid" "$bm"
    fi
  done
done
wait

log ""
log "📊 aggregating bet-mult matrix..."
if [ -f scripts/aggregate_bet_mult_sweep.py ]; then
  python3 scripts/aggregate_bet_mult_sweep.py "$SWIDS_CSV" "$BET_MULTS_CSV" \
    >> "$CHAIN_LOG" 2>&1 \
    && log "✅ AGGREGATE → reports/sweep-bet-mult/MATRIX.md" \
    || log "⚠️  aggregate failed (see SWEEP.log)"
else
  log "⚠️  scripts/aggregate_bet_mult_sweep.py missing — skipping aggregate"
fi

log "🏁 SWEEP DONE — see $OUT_DIR/"
