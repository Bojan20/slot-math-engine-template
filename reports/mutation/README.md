# Mutation Testing Reports — P0 #8 baseline

> **Status:** First committed run. **TS portion done; Rust portion blocked
> by toolchain pin.** This file replaces the empty `.gitkeep` placeholder
> with measured numbers + the gap that's documented so it's not hidden.

## TL;DR

| Suite               | Files scanned | Killed | Survived | Timeout | NoCov | **Score** | Status |
|---------------------|---------------|--------|----------|---------|-------|-----------|--------|
| TS (Stryker, scoped)| 2             | 207    | 126      | 2       | 7     | **61.1%** | ⚠️ below 95% target |
| Rust (cargo-mutants)| 0             | —      | —        | —       | —     | —         | ❌ blocked by toolchain pin |

## Hardware & toolchain (this run)

| Item             | Value                                       |
|------------------|---------------------------------------------|
| Machine          | Apple M3 Pro / macOS 15 (Darwin 25.3.0)     |
| Node / Vitest    | (uses repo's pinned versions)               |
| Stryker          | `@stryker-mutator/core` + `vitest-runner`   |
| Rust toolchain   | 1.83.0 (pinned in `rust-toolchain.toml`)    |
| Date             | 2026-05-12                                  |
| Wall-clock (TS)  | 2 min 15 s for 2 files / ~340 mutants       |

---

## TypeScript — first measured Stryker run

### Configuration

Scoped configuration at `/tmp/stryker-scoped.config.mjs` (NOT committed —
generated per-run). Targets two well-tested critical modules:

- `src/rg/session.ts`  — Responsible Gaming session state machine
- `src/sensitivity/analyzer.ts` — RTP sensitivity + auto-tuner solver

Both modules have dedicated test suites (`tests/faza118_rg_aml.test.ts`,
`tests/faza67_sensitivity.test.ts`) that ran during the mutation pass.

### Per-file results

```
src/sensitivity/analyzer.ts:
  killed    = 60
  survived  = 59
  timeout   = 2
  nocov     = 7
  total     = 128
  score     = 46.9%

  top survived mutator kinds:
    ConditionalExpression : 16
    EqualityOperator      :  8
    LogicalOperator       :  8
    ArithmeticOperator    :  6
    ArrowFunction         :  4
```

```
src/rg/session.ts:
  killed    = 147
  survived  = 67
  timeout   = 0
  nocov     = 0
  total     = 214
  score     = 68.7%

  top survived mutator kinds:
    ConditionalExpression : 18
    EqualityOperator      : 10
    StringLiteral         :  9
    ArithmeticOperator    :  8
    LogicalOperator       :  7
```

### Combined score

`(60 + 147) / (128 + 214) = 207 / 342 = 60.5%` of detected mutants killed,
or `61.1%` if you use Stryker's "covered" denominator (excludes no-coverage).

### What the survived mutants tell us

The dominant survivor category — `ConditionalExpression` mutator —
replaces `cond ? a : b` with either `true ? a : b` or `false ? a : b`.
When tests don't exercise both branches independently, both replacements
behave identically to the original, so the mutant survives.

**Concrete example** from `analyzer.ts:249`:

```diff
- achievedHitRate: config.targetHitRate != null ? finalResult.hitRate : undefined,
+ achievedHitRate: true ? finalResult.hitRate : undefined,
```

The current tests (`TUNER-14/15/17`) always set `targetHitRate`, so the
`!= null` branch is never falsified — mutant survives. To kill it: add a
test with `targetHitRate: undefined` and assert `achievedHitRate ===
undefined`.

`EqualityOperator` survives are similar — boundary `<` vs `<=` cases not
tested independently. `StringLiteral` survives in `rg/session.ts` mostly
hit event-name strings that aren't asserted exactly in tests.

### Path to 95% target

Reaching the acceptance bar (≥95% mutation score) is a **test-strength
exercise**, not an engine bug. Concrete next steps:

1. For each surviving `ConditionalExpression` mutant: add a test that
   exercises the falsified branch.
2. For each surviving `EqualityOperator` mutant: add a boundary test
   (off-by-one + exact boundary).
3. For surviving `StringLiteral` in event names: add a test that asserts
   the exact emitted event name (`expect(events).toContain('reality_check_due')`).
4. For `NoCoverage` mutants: those are code paths not reached by ANY
   test — usually error branches. Add fault-injection tests.

Estimated 1 dev-day per file to lift score from 50-70% → 95%+.

### Methodology — how to reproduce

```bash
cd /Volumes/Bojan\ -\ T7/slot-math-engine-template

# Install if needed
npm install --save-dev \
  @stryker-mutator/core \
  @stryker-mutator/vitest-runner

# Use the canonical full config (10 files, ~hours of wall-clock)
npx stryker run stryker.config.mjs

# Or scoped config for fast iteration (per-file or 2-3 files)
# (see /tmp/stryker-scoped.config.mjs in this commit's message)
npx stryker run /tmp/stryker-scoped.config.mjs

# Results land in reports/mutation/<name>.json + stryker's HTML
```

### Files in this report

```
reports/mutation/
├── README.md                         ← this file
└── scoped-2026-05-12.json            ← Stryker JSON for the 2-file run
                                         (~945 KB; full survivor + tests-ran
                                          payload per mutant)
```

The JSON is rich — every mutant carries:
- `id`, `mutatorName`, `replacement`, `location.{start,end}`
- `status` ∈ `{Killed, Survived, Timeout, NoCoverage, RuntimeError}`
- `testsCompleted` and `coveredBy[]`

CI gate (future): `jq '.thresholds.high'` of this file ≥ 95 → pass.

---

## Rust — BLOCKED by toolchain pin

`cargo-mutants` ≥ 24.0 requires the `edition2024` Cargo feature, which
landed in **Rust 1.85**. Our `rust-toolchain.toml` pins **Rust 1.83.0**
intentionally — the differential TS↔Rust parity gate (`tests/
faza2_parity.test.ts`) depends on every developer and every CI runner
producing byte-identical PCM / RTP output, which means locking compiler
version + target spec + components.

Older `cargo-mutants` versions (≤ 23.x) are not published on crates.io
in a form that resolves to a usable binary under 1.83.

### Options to unblock

| Option                                        | Cost                                                | Risk                                                                       |
|-----------------------------------------------|-----------------------------------------------------|----------------------------------------------------------------------------|
| **A**: Bump pin to `1.85`                     | 1 line edit + full CI re-run on 4 OS × 3 archs      | Breaking change for any external consumer pinned to 1.83 (template state is "internal", risk small but real) |
| **B**: Use separate nightly toolchain for mutants| `~/.rustup/toolchains/nightly/...` + script wrapper | Doesn't drift the parity guarantee; adds a "mutation runs on nightly" footnote in compliance.md |
| **C**: Skip Rust mutation, ship TS-only       | Zero                                                | Mutation score claim is partial — TS only, not Rust                        |

This iteration ships **Option C** with documentation. Option B is the
right follow-up (one tracking issue, ~1 hour script work).

### When Option B lands, expected outputs

```
reports/mutation/rust/
├── outcomes.json     ← cargo-mutants native output
├── outcomes.txt      ← human-readable summary
└── README.md         ← interpretation per-module
```

---

## Open issues this report surfaces

1. **TS mutation score is at 61%, target is 95%** — gap is real test
   strength, not engine bugs. Concrete uplift path is in §"Path to 95%
   target" above. ~2 dev-days for the 2 files measured here; ~10 days for
   the full 10-file config in `stryker.config.mjs`.

2. **Rust mutation is unmeasured** — toolchain pin / cargo-mutants version
   conflict. See "Options to unblock" above. Until then, Rust portion of
   the engine has **no mutation-score evidence**; tests are simply
   assumed to be strong, which is a hole.

3. **No regression-detection CI gate yet** — the score from this run
   isn't compared against a previous run. P0 #8 follow-up: store a
   baseline JSON and add a CI step that fails if score drops > 1%.

4. **No coverage of: features/, evaluators/, behaviors/, observability/,
   jackpot/, crypto/, fraud/, player/, engine/irEvaluator** — these are
   in the canonical `stryker.config.mjs` but weren't run in this iteration
   (would take ~12-15 hours wall-clock single-machine). Worth running in
   CI on a cron schedule.

---

## Compliance value

A measured mutation score is part of the audit kit per GLI-11 §"test
strength evidence". Even at 61%, this is **measured** — a regulator can
see the surviving mutants list and the planned fixes, which is materially
stronger than "we have tests".

Goal for the next iteration: full-config (10 file) TS run + Option B
Rust toolchain wrapper → both portions of the audit kit have a number.
