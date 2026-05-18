# PRE_PROD_GAUNTLET

> W212 Faza 600.1 — Agent C. Single-command pre-production validation
> runbook for `slot-math-engine-template`.

The pre-prod gauntlet is the last gate every release candidate must pass
before deployment. It collapses ten independent validation checks behind a
single command, aggregates the verdicts, and exits non-zero if anything
failed.

## TL;DR

```bash
# CI / fast feedback (synthetic mode, ≤ 15 min)
npm run perf:gauntlet:synthetic

# Pre-release (full mode, unbounded)
npm run perf:gauntlet
```

Outputs land under `reports/gauntlet/PRE_PROD_GAUNTLET_{timestamp}.md`.
The `latest` symlink-style file is always overwritten:
`reports/gauntlet/PRE_PROD_GAUNTLET_latest.md`.

## The ten gates

| # | Gate | What it does | Source |
| --- | --- | --- | --- |
| 1 | smoke-suite | Runs the W210 smoke harness (six smokes in parallel) | `scripts/smoke-tests/run-all-smoke.mjs` |
| 2 | pilot-integration | Loads the W211 pilot suite module + sanity checks | `scripts/pilot/run-integration-suite.mjs` |
| 3 | billion-spin-synth | 1B spin benchmark in synthetic mode (1M total) | `scripts/perf/billion-spin-benchmark.mjs` |
| 4 | load-test-gaas | W208 load-test histogram primitive sanity | `scripts/load-test/_lib.mjs` |
| 5 | cert-rehearsal | Loads cert-dossier-build, confirms it builds | `scripts/cert-dossier-build.mjs` |
| 6 | chaos-scenarios | Runs W212 Agent B chaos pack if present, else skip | `reports/chaos/` |
| 7 | mutation-refresh | Re-analyses latest Stryker artifact, diffs baseline | `scripts/mutation/refresh.mjs` |
| 8 | perf-regression-check | Runs the seven-metric baseline tracker | `scripts/perf/baseline-tracker.mjs` |
| 9 | latency-budget-snapshot | Sanity-checks percentile math | inline |
| 10 | memory-leak-quick | 2-minute synthetic memory growth probe | `scripts/perf/memory-leak-detector.mjs` |

Every gate is reported with a verdict (`PASS` / `FAIL` / `SKIP`), a
duration, and a key metric. The aggregate verdict is the AND of all
non-skipped gates.

## CLI

```bash
# Run all gates synthetic mode
node scripts/perf/pre-prod-gauntlet.mjs --synthetic

# Run only specific gates
node scripts/perf/pre-prod-gauntlet.mjs --only=smoke-suite,mutation-refresh

# Skip specific gates
node scripts/perf/pre-prod-gauntlet.mjs --skip=load-test-gaas

# Full mode (no time budget)
node scripts/perf/pre-prod-gauntlet.mjs --full
```

## What each gate validates

### 1. smoke-suite (W210)

Validates that the six smokes (spin flow, license verify, jurisdiction
rules, RNG determinism, cert export, wallet providers) all pass in
synthetic mode. Exits non-zero if any smoke fails.

**Troubleshooting**: Re-run individually with
`node scripts/smoke-tests/smoke-<name>.mjs --synthetic` to isolate.

### 2. pilot-integration (W211)

Loads the 10-step pilot integration suite module and confirms it exposes
`ALL_STEPS`. In synthetic mode we don't run the full suite — that's the
job of `npm run pilot:integration:quick`. This gate guards module health.

### 3. billion-spin-synth

Runs `runBenchmark({ synthetic: true, skipRust: true, kernels: 3 })`.
Confirms the multi-kernel benchmark harness produces a sensible
`spinsPerSec` baseline on the host. Fails if throughput is zero (broken
harness).

### 4. load-test-gaas

Exercises the W208 `Histogram` primitive with 1000 synthetic samples and
asserts `p99 < 50ms`. Catches a regression in the histogram math itself,
not the live load test. For the live load test run
`npm run load-test:gaas:quick`.

### 5. cert-rehearsal

Confirms `cert-dossier-build.mjs` loads and exposes `buildDossier`. The
full rehearsal lives in `.github/workflows/cert-dossier-rehearsal.yml`;
this gate is the integration-time sanity check.

### 6. chaos-scenarios

If `reports/chaos/` exists (produced by W212 Agent B's chaos pack), the
gate consumes those results. Otherwise it skip-passes — the gauntlet
should not block when an optional sibling pack is absent.

### 7. mutation-refresh

Re-analyses the most recent Stryker JSON artifact under
`reports/mutation/`. Diffs against `reports/mutation/baseline.json`.
Fails when new survivors appear or a per-file score regresses.

### 8. perf-regression-check

Runs `runCheck()` from the baseline tracker. Fails if any of the seven
tracked metrics has regressed > 10% vs the committed baseline.

### 9. latency-budget-snapshot

Synthetic percentile-math sanity. Cheap, fast, surfaces a regression in
the percentile reservoir before it taints production observability.

### 10. memory-leak-quick

Runs `detect({ synthetic: true, samplePeriodMs: 50, samples: 6 })` — a
six-sample heap growth probe taking ~300ms. Fails when the linear-fit
slope exceeds 1 MiB/minute (the same threshold as the full-mode 2-hour
detector).

## Time budgets

- **Synthetic**: 15-minute soft cap. Gauntlet reports overall fail if
  total wall exceeds this even when every gate passes individually.
- **Full**: no cap. Operator runs this before a release; CI does not.

## Failure modes & response

| Symptom | Likely cause | Response |
| --- | --- | --- |
| smoke-suite FAIL | smoke script regression | Re-run individually, isolate the failing smoke |
| pilot-integration FAIL | module load error | `node -e 'import(...)'` to surface the error |
| billion-spin-synth FAIL | benchmark harness broken | Inspect `BILLION_SPIN_BENCHMARK.json` |
| mutation-refresh FAIL | new survivor introduced | Inspect `W212_REFRESH.md` survivors list |
| perf-regression-check FAIL | metric regressed > 10% | See `docs/PERF_BENCHMARKS.md#what-to-do-when-a-regression-fires` |
| memory-leak-quick FAIL | heap growth detected | Run with `--samples=30` for longer signal; profile with `--inspect` |
| chaos-scenarios SKIP | Agent B pack absent | Expected when chaos pack not generated; not a failure |
| Total wall > 15min | Gauntlet slowness creep | Profile each gate's duration column |

## CI integration

The gauntlet is **not** a default CI gate today — it's invoked from
release branches and pre-deploy workflows. The seven-metric regression
check (gate #8 above) **is** a default CI gate via
`.github/workflows/perf-regression.yml`.

To wire the full gauntlet into a new workflow:

```yaml
- name: Pre-prod gauntlet (synthetic)
  run: npm run perf:gauntlet:synthetic
```

## Artifacts

| Path | Format | Use |
| --- | --- | --- |
| `reports/gauntlet/PRE_PROD_GAUNTLET_latest.md` | Markdown | Human review |
| `reports/gauntlet/PRE_PROD_GAUNTLET_latest.json` | JSON | Programmatic verdict |
| `reports/gauntlet/PRE_PROD_GAUNTLET_<timestamp>.md` | Markdown | Audit trail |
| `reports/gauntlet/PRE_PROD_GAUNTLET_<timestamp>.json` | JSON | Audit trail |

## See also

- `docs/PERF_BENCHMARKS.md` — benchmark methodology and regression policy
- `docs/RUNBOOK.md` — operator runbook
- `docs/INCIDENT_RESPONSE.md` — post-deploy incident playbook
- `scripts/smoke-tests/_lib.mjs` — smoke envelope contract
- `scripts/perf/baseline-tracker.mjs` — baseline tracker source
