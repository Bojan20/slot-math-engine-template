# Fuzz Discovery — methodology, cadence, interpretation

W215 Faza 600.4 — the engineering playbook for our TypeScript fuzz
discovery program, on top of the W212/W214 harness foundation.

## Why discovery?

Random fuzz testing finds **crashes** (uncaught throws, unreachable
states). _Discovery_ is the act of running fuzz at scale — millions of
iterations across every target — to flush out subtle logic bugs that
hide behind a healthy crash count of 0.

We complement crash-hunting with **properties** (W215 §9): explicit
invariants like determinism, conservation, idempotency, round-trip,
and monotonicity. Properties test the contract, not the absence of an
exception.

## Architecture

```
scripts/fuzz/
├── _lib.mjs                W212 — primitives (PRNG, generators, shrink)
├── _lib-v2.mjs             W215 — discovery extensions
├── fuzz-ir-evaluator.mjs   W212 — IR parser fuzz
├── fuzz-marketplace-api.mjs W212 — REST payload fuzz
├── fuzz-wallet-providers.mjs W212 — adapter normaliser fuzz
├── fuzz-cert-bundle.mjs    W212 — dossier manifest fuzz
├── fuzz-spin-engine.mjs    W215 — debit→spin→credit→audit pipeline
├── fuzz-canary-controller.mjs W215 — W210 rollout state machine
├── fuzz-license-jwt.mjs    W215 — HS256 license token verifier
├── discovery-run.mjs       W215 — orchestrator across all 7 targets
├── ingest-findings.mjs     W215 — classifier + regression generator
├── dashboard.mjs           W215 — multi-week trend renderer
└── properties.mjs          W215 — explicit invariants
```

## Iteration budgets

The `runFuzzV2` runner in `_lib-v2.mjs` exposes 3 named modes plus
arbitrary numeric overrides.

| Mode | Iter / target | Total iter | Use-case |
| --- | ---: | ---: | --- |
| `synthetic` | 10 000 | 70 000 (7×10K) | CI smoke + local sanity |
| `discovery` | 1 000 000 | 7 000 000 | Weekly sweep (this doc) |
| `exhaustive` | 100 000 000 | 700 000 000 | Pre-release deep run |

`discovery-run.mjs --synthetic` runs at 50 000 iter / target by default
(this overrides the named-mode lookup) and completes <2 min on M-class
laptops or CI runners.

Run modes:

```sh
# Local sanity (fast)
npm run fuzz:discovery:synthetic

# Weekly sweep
npm run fuzz:discovery

# Single target (deeper)
FUZZ_BUDGET=discovery node scripts/fuzz/fuzz-spin-engine.mjs
```

Each run lands in `reports/fuzz/discovery/<ISO_TIMESTAMP>/` with:

- `summary.json` and `summary.md`
- `crashes/<harness>.json` — unique crash records (only when found)
- `coverage/<harness>.json` — per-target branch hit counts
- `interesting-inputs/` — seeds that grew coverage (the seed corpus)

A pointer to the most recent run is kept in
`reports/fuzz/discovery/LATEST.txt`.

## Cadence

| Cadence | Workflow | Budget | Purpose |
| --- | --- | --- | --- |
| Pre-PR (local) | `fuzz:discovery:synthetic` | <2 min | Catch obvious regressions |
| Weekly Sun 03:00 UTC | `fuzz-discovery-weekly.yml` | 4 h | 500 K iter × 7 targets, ingest, dashboard |
| Pre-release | `fuzz:discovery --exhaustive` (manual) | Multi-hour | Deep release validation |

The weekly workflow is staggered to run **after** the existing
`fuzz-weekly.yml` (cargo-fuzz) so Rust + TypeScript reports both land
before Monday morning standup.

## Interpreting findings

The ingester (`scripts/fuzz/ingest-findings.mjs`) classifies every
unique crash by signature:

| Class | Trigger heuristic | Typical fix |
| --- | --- | --- |
| `timeout` | Message contains "timed out" | Add iteration cap or early-exit |
| `null_pointer` | "Cannot read properties of undefined / null" | Guard with `==null` or default |
| `type_error` | "is not a function" / "not iterable" | Add `typeof` check before call |
| `stack_overflow` | "Maximum call stack" | Convert recursion to iteration |
| `state_corruption` | Conservation / drift / trail-length | Audit pipeline math + invariants |
| `prototype_pollution` | `__proto__` in key path | Reject in validator |
| `parse_error` | JSON / parse keywords | Validate before parse |
| `crypto` | Signature / hmac mismatch | Constant-time compare, rotate secret |
| `off_by_one` | Length-N mismatch | Re-derive boundary inequality |
| `uncategorised` | Nothing matched | Read the stack trace manually |

For each crash the ingester writes
`reports/fuzz/ingest/<run>/issues/<harness>-<seed>.md` (paste-ready
GitHub issue body) and `regressions/<harness>-<seed>.test.mjs` (vitest
regression case).

## Adding a new fuzz target

1. Create `scripts/fuzz/fuzz-<name>.mjs`.
2. Export `main(opts)` and a `body(input, cov)` matching the W215
   contract (`body` receives the optional `CoverageMap` proxy).
3. Use `runFuzzV2` from `_lib-v2.mjs`.
4. Add the harness id to the `HARNESSES` array in `discovery-run.mjs`.
5. Add an `npm run fuzz:<name>` script.
6. Add a spec to `scripts/tests/fuzz-targets-new.test.mjs`.

Target hermeticity is mandatory: the harness must compile without
touching the live game-engine code. We mirror the contract via a stub
in the same module — keeps CI runs deterministic and dependency-free.

## Writing properties

Properties live in `scripts/fuzz/properties.mjs`. Each property is a
function `(iterations: number) => { property, iterations, violations }`.

Conventions:

- Deterministic seeds (`new FuzzRng(i + 1)`) so a violation can be
  replayed.
- Skip inputs that fail preconditions — do NOT count them as
  violations.
- Cap the violation list size before reporting (1000 max) so a fully
  broken property doesn't OOM.

## Shrinker

The W215 shrinker (in both `_lib.mjs` and `_lib-v2.mjs`) uses a
hybrid algorithm:

1. **Phase 1** — aggressive halving (legacy v1 behaviour).
2. **Phase 2** — binary search bisect for sequences, single-key
   pruning for objects.

For a "fails iff len > 4" predicate on a 64-char string the W215
shrinker reaches the true minimum (length 5) instead of the W214
power-of-two stop point (length 8).

## Coverage instrumentation

`CoverageMap.mark(label)` is a manual counter — the body chooses
which branches to instrument. We deliberately avoid AST rewriting:
the harness is pure Node, no transformation step.

Inputs that grow the unique-branch count are saved to
`reports/fuzz/seed-corpus/<harness>/` and reused on subsequent runs to
preserve coverage gains.

## Reproducing a failure

Each crash record carries the iteration seed (`crash.seed`). To
reproduce locally:

```sh
node -e "
import('./scripts/fuzz/_lib.mjs').then(({FuzzRng}) => {
  const rng = new FuzzRng(SEED);
  // build input the same way the harness does …
});
"
```

For higher-level targets the ingester's generated regression test
case wraps the seed into a vitest spec, so the simplest path is to
move that file into `scripts/tests/` and run `npx vitest run`.

## Dashboard

`npm run fuzz:dashboard` aggregates the most recent four discovery
runs into:

- `reports/fuzz/FUZZ_DASHBOARD.json`
- `reports/fuzz/FUZZ_DASHBOARD.md`
- `reports/fuzz/FUZZ_DASHBOARD.html` (zero-dep inline-SVG sparklines)

The HTML view renders crash and branch-count history per harness, so
hot-spots become visually obvious week-over-week.

## Quality bar

| Metric | Target |
| --- | --- |
| Synthetic discovery wall time | <2 minutes |
| Discovery (500K iter) wall time | <4 hours |
| Properties: violation count on `main` | 0 |
| Property iterations per check (CI) | ≥ 10 000 |
| Unique crash count on `main` | 0 |
| Regression test coverage of fixed crashes | 100% |

## Reporting cadence

| Event | Action |
| --- | --- |
| Synthetic finds a crash on `main` | Fix immediately, regression test, commit |
| Weekly discovery finds new crash | Issue auto-stubbed by ingester, triage <48h |
| Property violation on `main` | Treat as P1 — block release |
| Coverage regression (>10% drop) | Investigate; usually a target stopped exercising a branch |
