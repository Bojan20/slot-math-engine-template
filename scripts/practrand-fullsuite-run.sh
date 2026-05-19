#!/usr/bin/env bash
# PractRand 2^N-byte audit driver for all 5 RNG backends, in parallel.
#
# Usage:
#   PRACTRAND_DIR=/tmp/practrand/PractRand BYTES_PER=68719476736 \
#     bash scripts/practrand-fullsuite-run.sh
#
# Defaults: BYTES_PER = 64 GiB (2^36) — a reasonable intermediate audit
# size that finishes in ~2-4h on M3 Pro vs the canonical 2^38 = 256 GiB
# that takes ~10+h. Override BYTES_PER for full submission.
#
# Output (per backend, in reports/rng/):
#   <backend>-practrand-<bytes>.txt   raw RNG_test transcript
#   <backend>-practrand-<bytes>.verdict   "PASS" / "FAIL" / "UNUSUAL_ONLY"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRACTRAND_DIR="${PRACTRAND_DIR:-/tmp/practrand/PractRand}"
BYTES_PER="${BYTES_PER:-68719476736}"  # 2^36 = 64 GiB
OUT_DIR="$REPO_ROOT/reports/rng"

if [[ ! -x "$PRACTRAND_DIR/RNG_test" ]]; then
  echo "ERROR: RNG_test binary not found at $PRACTRAND_DIR/RNG_test" >&2
  echo "Build PractRand first: see reports/rng/HOWTO-fullsuite.md" >&2
  exit 1
fi

# PractRand accepts metric postfixes KB/MB/GB/TB (binary KB = 1024 bytes per
# de facto convention — see RNG_test --help). It does NOT accept 'GiB'.
BYTES_LABEL=$(node -e "
const n = ${BYTES_PER};
if (n >= 1 << 30) console.log((n / (1 << 30)).toFixed(0) + 'GB');
else if (n >= 1 << 20) console.log((n / (1 << 20)).toFixed(0) + 'MB');
else console.log(n + 'B');
")

BACKENDS=(mulberry32 pcg64 xoshiro256ss philox4x32 chacha20)

mkdir -p "$OUT_DIR"

run_one() {
  local b="$1"
  local out="$OUT_DIR/${b}-practrand-${BYTES_LABEL}.txt"
  local verdict_path="$OUT_DIR/${b}-practrand-${BYTES_LABEL}.verdict"
  local t0=$(date +%s)
  node "$REPO_ROOT/scripts/rng-quality.mjs" --dump "$b" "$BYTES_PER" 2>/dev/null \
    | "$PRACTRAND_DIR/RNG_test" stdin -tlmax "${BYTES_LABEL}" -tlfail \
    > "$out" 2>&1
  local elapsed=$(( $(date +%s) - t0 ))
  # Verdict: count FAIL lines
  local fails=$(grep -c "FAIL" "$out" || true)
  local unusual=$(grep -c "unusual" "$out" || true)
  if [[ "$fails" -eq 0 && "$unusual" -eq 0 ]]; then
    echo "PASS_CLEAN ${elapsed}s" > "$verdict_path"
  elif [[ "$fails" -eq 0 ]]; then
    echo "PASS_WITH_${unusual}_UNUSUAL ${elapsed}s" > "$verdict_path"
  else
    echo "FAIL_${fails}_FAIL_${unusual}_UNUSUAL ${elapsed}s" > "$verdict_path"
  fi
  echo "  $b done in ${elapsed}s — $(cat "$verdict_path")"
}

export -f run_one
export REPO_ROOT PRACTRAND_DIR BYTES_PER OUT_DIR BYTES_LABEL

echo "▶ PractRand ${BYTES_LABEL} × ${#BACKENDS[@]} backends in parallel ..."
for b in "${BACKENDS[@]}"; do
  ( run_one "$b" ) &
done
wait

echo "✓ All PractRand runs complete. Artefacts in $OUT_DIR"
for b in "${BACKENDS[@]}"; do
  echo "  $b: $(cat "$OUT_DIR/${b}-practrand-${BYTES_LABEL}.verdict" 2>/dev/null)"
done
