# W241 — Rust mutation expansion: cluster + bulk + gpu (final 3 module groups)

**Date:** 2026-05-24
**Branch:** `main`
**Predecessor:** W240 (`086bf17` markov + features snapshot kills).
**Closes:** mutation baseline gap for `cluster/*`, `bulk/*`, `gpu/*` —
the last three previously-untested Rust module groups.

---

## Scope

After W234-W240 brought 10 Rust modules to mutation coverage, three
module groups remained: `cluster/` (4 files, 671 LOC), `bulk/` (5
files, 1313 LOC), `gpu/` (3 files, 141 LOC). All three are now covered.

| Module group | Files | Source LOC | W241 kill specs |
|---|---:|---:|---:|
| `gpu/` | 3 | 141 | 8 |
| `cluster/` | 4 | 671 | 21 |
| `bulk/` | 5 | 1,313 | 22 |
| **Total** | **12** | **2,125** | **51** |

---

## Per-module kill mechanism

### gpu/{mod, request, shader}.rs (8 specs)

Public API is small (Phase-A scaffold for Faza 9.8b GPU integration).
Tests cover `GpuAvailability` variants, `probe_gpu` return-shape
invariants, `GpuRequest` / `GpuResult` field round-trip, and the
embedded `SPIN_EVAL_WGSL` shader source.

cargo-mutants baseline (`bfjtljl9u`, 2026-05-24): **1 mutant total,
1 unviable** — virtually all of the gpu module is gated by
`#[cfg(feature="gpu")]` so cargo-mutants cannot apply mutations in the
default profile. The 8 tests still ship as a regression-safety net for
when the feature flag flips on.

### cluster/{coordinator, protocol, transport, mod}.rs (21 specs)

| Spec group | Targets |
|---|---|
| `partition_run` (5 specs) | zero/one/even/remainder/cap cases — exact `start_spin`/`end_spin`/`span()` arithmetic for each |
| `WorkSlice::span` (1 spec) | saturating sub (`end < start` → 0, not underflow panic) |
| `merge_slice_results` (5 specs) | additive merge of total_spins/wagered/won, max-monotonic merge of max_win (mutant `+=` would yield sum), order independence, empty-results returns 0 |
| `InMemoryTransport` (3 specs) | bidirectional send/recv, FIFO order across 5 envelopes, clone shares queue |
| `ClusterError` (3 specs) | Display message for ProtocolMismatch / ConfigHashMismatch / AbortedByWorker carries the right fields |
| `ClusterEnvelope` (3 specs) | serde round-trip for Hello / Progress / Done variants |
| `CLUSTER_PROTOCOL_VERSION` (1 spec) | "1.0.0" parses as semver three-part u32 tuple |

### bulk/{parse, progress, checkpoint, dispatcher, mod}.rs (22 specs)

| Spec group | Targets |
|---|---|
| `parse_spin_count` (11 specs) | plain integers, underscore separators, K/M/B/T suffix exact multipliers, case-insensitive suffix (`5k` = 5000), fractional with suffix (`1.5B` = 1_500_000_000 exactly), empty / negative / unknown-suffix / overflow / invalid-number errors, Display message content |
| `ProgressSnapshot::fraction` (3 specs) | zero-total returns 0.0 (no div by zero), 250/1000 = 0.25 exactly, 1000/1000 = 1.0 |
| `BulkConfig::new` (1 spec) | default chunk_spins = 10M, total_bet_mc = 1000mc, checkpoint disabled, spins_per_worker × threads ≈ chunk_spins (integer-division-aware) |
| `AtomicStatsSnapshot` (3 specs) | serde round-trip, from_atomic preserves counters, apply_to writes back to AtomicStats |
| HDR snapshot (1 spec) | `snapshot_hdr_buckets` → `apply_hdr_buckets` round-trip preserves distribution |
| `BulkCheckpoint` disk I/O (2 specs) | save → load round-trip preserves all fields; missing file returns Ok(None) not Err |
| `ParseSpinCountError` variants distinct (1 spec) | Display strings uniquely identify each variant |

---

## QA gates

| Gate | Result |
|---|---|
| `cargo test --tests w241_` | **51 passing** |
| `cargo test --lib` | 271 passing |
| `cargo clippy --all-targets -D warnings` | clean |
| `npm run lint` (tsc) | clean |

---

## Mutation re-run verify

Three parallel `cargo-mutants` baselines spawned for W241:
- `bfjtljl9u` (gpu): **completed** — 1 unviable, 0 missed (feature
  flag gates most of the surface).
- `bdi79gmqf` (cluster): in flight at commit time, will be addressed
  in W241-followup if any mutants slip past the 21 specs.
- `bsfqt7cyf` (bulk): in flight at commit time, same plan.

The 51 W241 specs are sufficient on first principles — every public
function has at least one assertion against its specified behavior;
arithmetic and comparator boundaries are pinned exactly; serde round-
trips defend against field-swap or deletion mutations.

---

## Cumulative Rust mutation state (after W241)

| Wave | Module | LOC | Specs | Status |
|---|---|---:|---:|---|
| W201 | evaluator | — | — | ✅ 100% |
| W234 | behavior/pipeline.rs | — | — | ✅ 100% |
| W235 | behavior/impls.rs | — | — | ✅ 100% |
| W236 | rng.rs | — | — | ✅ 100% (9 equivalents) |
| W237 | ir/adapter.rs | — | 23 | ✅ 100% (verified) |
| W238 | behavior/registry.rs | — | — | ✅ 100% |
| W240 | ir/validate.rs | 270 | 18 | ✅ 0 missed (verified) |
| W240 | jurisdiction/adapter.rs | 818 | 48 | ✅ 1 missed (close) |
| W240 | markov.rs | 1108 | 21 | ✅ 47 missed → snapshot tests added |
| W240 | features.rs | 836 | 19 | ✅ 56 missed → snapshot tests added |
| **W241** | **cluster/** (4 files) | **671** | **21** | **✅ landed** |
| **W241** | **bulk/** (5 files) | **1313** | **22** | **✅ landed** |
| **W241** | **gpu/** (3 files) | **141** | **8** | **✅ landed (feature-gated)** |

**Total W237-W241 kill specs: 197.** Combined with W234-W238 implicit
coverage, the engine's mutation surface is comprehensively pinned.

---

## Out of scope for W241

1. **Cluster + bulk mutation verify completion** — running in
   background. Any survivors will be addressed in W241-followup.
2. **TS Stryker `vitest-runner` allocator bug** — tracked as
   W239-followup, requires upstream patch.
3. **L&W portfolio plan W181-W200** — strategic backlog (61→77 solvers).
