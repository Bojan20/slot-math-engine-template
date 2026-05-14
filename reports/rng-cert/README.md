# `reports/rng-cert/` — RNG certification evidence

Closes **P0 #3** of the submission plug list at the engine layer: the
4 production RNG backends pass a built-in subset of NIST SP 800-22 at
16 MiB per backend. The harness also emits raw byte streams for
third-party regulator tools (TestU01, PractRand, NIST STS) — see the
**External certification runbook** below for how to produce those.

## What "P0 #3 done at engine layer" means

A *complete* regulator submission requires three independent test
suites — TestU01 BigCrush, NIST STS, and PractRand — each producing
their own report at GB-scale sample sizes. BigCrush alone takes
8–12 hours per backend on commodity hardware and PractRand can run
indefinitely.

What we ship in this commit:

| Component                                 | Status |
|-------------------------------------------|--------|
| Reproducible byte-stream harness          | ✅      |
| Built-in NIST SP 800-22 subset (8 tests)  | ✅      |
| All 4 backends pass at 16 MiB             | ✅      |
| Self-tests for the harness itself         | ✅      |
| Runbook for external TestU01 / PractRand  | ✅      |
| Captured external reports                 | ❌ (CI workflow ready; queue manually) |

The internal battery is **regression evidence**, not regulator
substitute. It catches a single-line edit that breaks an RNG backend
within ~2 s; it does NOT replace a 12-hour BigCrush run from a 3rd-
party tool.

## Per-backend internal-battery results (16 MiB, seed=12345)

Run: `cargo run --release --bin rng_cert -- --mode internal --rng <kind> --seed 12345 --bytes 16777216 --out reports/rng-cert/<kind>-internal.json`

| Backend | bytes | bits | monobit | block_freq | runs | longest_run | byte_chi2 | serial_2bit | cumsum | apprx_ent | ALL |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mulberry32 | 16,777,216 | 134,217,728 | 0.0820 ✅ | 0.7199 ✅ | 0.3628 ✅ | 0.3726 ✅ | 0.1443 ✅ | 0.1014 ✅ | 0.1303 ✅ | 0.0481 ✅ | ✅ |
| pcg64 | 16,777,216 | 134,217,728 | 0.4239 ✅ | 0.7322 ✅ | 0.4121 ✅ | 0.3088 ✅ | 0.8074 ✅ | 0.9040 ✅ | 0.7427 ✅ | 0.6393 ✅ | ✅ |
| xoshiro256ss | 16,777,216 | 134,217,728 | 0.1725 ✅ | 0.9518 ✅ | 0.2706 ✅ | 0.1436 ✅ | 0.3024 ✅ | 0.1302 ✅ | 0.1386 ✅ | 0.2416 ✅ | ✅ |
| philox4x32 | 16,777,216 | 134,217,728 | 0.6296 ✅ | 0.9349 ✅ | 0.9945 ✅ | 0.5099 ✅ | 0.1161 ✅ | 0.1837 ✅ | 0.4944 ✅ | 0.3242 ✅ | ✅ |
| chacha20 | 16,777,216 | 134,217,728 | 0.4340 ✅ | 0.8577 ✅ | 0.6176 ✅ | 0.9029 ✅ | 0.6544 ✅ | 0.3456 ✅ | 0.2076 ✅ | 0.5466 ✅ | ✅ |

Threshold: p ≥ 0.01 (NIST SP 800-22 standard). All 40 sub-tests pass (5 backends × 8 tests).

W152 Faza 7.2 update — **ChaCha20** (RFC 8439 CSPRNG) added in this wave;
required by UKGC / MGA / DE jurisdiction profiles per W152 P0-1.

## Tests implemented (all from NIST SP 800-22)

| Test | Spec § | What it catches |
|---|---|---|
| Monobit (frequency) | 2.1 | Bias toward 0 or 1 |
| Block frequency | 2.2 | Local bias within 1024-bit blocks |
| Runs | 2.3 | Over- or under-alternation of bits |
| Longest run of ones | 2.4 | Cluster bias within 10000-bit blocks |
| Byte chi² | n/a | 256-bucket uniformity (practitioner standard) |
| Serial m=2 | 2.11 | 2-bit pattern distribution |
| Cumulative sums | 2.13 | Random-walk maximum deviation |
| Approximate entropy m=2 | 2.12 | Predictability of next bit |

P-values use proper algorithms — chi² via incomplete gamma series +
continued fraction (Numerical Recipes 6.2); erfc via Abramowitz &
Stegun 7.1.26; normal CDF derived from erf. Cumulative sums uses the
full NIST alternating-Φ series, NOT the Kolmogorov upper bound.

## Reproducibility

```
seed = 12345
bytes = 16 MiB (= 134,217,728 bits)
harness commit = <see git log of rust-sim/src/bin/rng_cert.rs>
toolchain = rust-toolchain.toml pin (1.83.0)
```

Same seed × same backend × same harness commit → byte-identical JSON
report. Verified by `tests/faza7_rng_cert.rs::determinism_same_seed…`.

## External certification runbook

The harness writes a raw little-endian u64 stream to stdout in `stream`
mode. Pipe it to whichever test tool the regulator requires.

### PractRand (≥4 GB recommended, 10–60 min)

```bash
# Install (one-time)
cd /tmp && curl -L https://sourceforge.net/projects/pr-and/files/latest/download -o pr.zip
unzip pr.zip && cd PractRand-*-bin
make

# Run against pcg64 — 4 GB sample
./target/release/rng_cert --mode stream --rng pcg64 --seed 12345 --bytes $((4*1024*1024*1024)) \
  | RNG_test stdin64 -tlmax 1G > reports/rng-cert/pcg64-practrand.txt
```

### NIST STS (15-test battery, 5–15 min per backend)

```bash
# Install (one-time)
git clone https://github.com/terrillmoore/NIST-Statistical-Test-Suite /tmp/sts
cd /tmp/sts && make

# Run against pcg64 — 125 MB sample
./target/release/rng_cert --mode stream --rng pcg64 --seed 12345 --bytes 125000000 \
  > /tmp/pcg64-125MB.bin
cd /tmp/sts && ./assess 1000000 < /tmp/pcg64-125MB.bin
# Outputs in: experiments/AlgorithmTesting/finalAnalysisReport.txt
cp experiments/AlgorithmTesting/finalAnalysisReport.txt \
  $REPO/reports/rng-cert/pcg64-nist-sts.txt
```

### TestU01 SmallCrush / Crush / BigCrush (15 min / 1 h / 8–12 h per backend)

```bash
# Install (one-time)
curl -O https://simul.iro.umontreal.ca/testu01/TestU01.zip
unzip TestU01.zip && cd TestU01-*
./configure --prefix=/usr/local && make && sudo make install

# Write a tiny wrapper that reads stdin and runs SmallCrush:
cat > /tmp/run_smallcrush.c <<'EOF'
#include "unif01.h"
#include "bbattery.h"
#include <stdio.h>
int main(void) {
  unif01_Gen *g = unif01_CreateExternGenBits("stdin", NULL);
  bbattery_SmallCrush(g);
  return 0;
}
EOF
gcc -o /tmp/run_smallcrush /tmp/run_smallcrush.c -ltestu01 -lprobdist -lmylib -lm

# Run against pcg64
./target/release/rng_cert --mode stream --rng pcg64 --seed 12345 --bytes $((512*1024*1024)) \
  | /tmp/run_smallcrush > reports/rng-cert/pcg64-smallcrush.txt
```

### CI workflow (queue full battery)

A `.github/workflows/rng-cert.yml` is provided as a manual-dispatch
workflow. It builds PractRand + NIST STS from source, then loops over
all 4 backends. Wall-clock budget: ~4 hours on a `ubuntu-latest`
runner. Triggers: `workflow_dispatch` only — do NOT run on every push.

## Self-tests

`rust-sim/tests/faza7_rng_cert.rs` (4 tests, ~2 s wall-clock):

- `pcg64_passes_full_battery_at_16_mib`     — quality regression guard
- `all_four_backends_produce_distinct_byte_streams` — implementation
  divergence guard
- `determinism_same_seed_same_rng_same_report` — reproducibility
- `small_sample_does_not_crash`               — fuzz-style robustness

Run: `cargo test --release --test faza7_rng_cert`.

## What this report does NOT establish

- It does NOT replace 3rd-party tooling. Operators submitting to UKGC,
  MGA, or DE GlüNeuRStV will run TestU01 + NIST STS + PractRand against
  the same backends as part of their own evidence chain.
- It does NOT test the entropy source (covered by `src/qrng/`).
- It does NOT test the commit-reveal protocol (covered by
  `src/crypto/commitReveal.ts`).
- It does NOT test resistance to active adversary (covered by
  `src/zkproof/` if the operator requires zero-knowledge proofs).

The bridge from this evidence to regulator-grade certification is
mechanical: install the tools listed above, run the documented
commands, and attach the per-backend reports to the submission kit.
