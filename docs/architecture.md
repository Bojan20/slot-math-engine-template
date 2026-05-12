# Architecture

**Status:** Draft v0.1 — Faza 0.2 deliverable
**Scope:** How a single spin flows through TS and Rust simultaneously,
why the engine is dual-stack, and which modules own which step.

---

## Why dual-stack (TS + Rust)

The engine ships **two implementations of the same math** because each
audience needs a different physical artefact:

| Audience      | Stack | Why                                                                    |
|---------------|-------|------------------------------------------------------------------------|
| Game designer | TS    | Preview in a browser, hot-reload, sub-100 ms response on a single spin |
| Math QA       | Both  | Diff TS↔Rust on the same seed — any drift is a bug                     |
| Certifier     | Rust  | 10⁹–10¹² spin sims feasible only on the parallel native build          |
| Operator      | Rust  | Production sim node — ≥ 20 M spins/sec, GPU optional                   |

The **IR document** (`docs/IR_SPEC.md`) is the contract. Both engines
load the *exact same JSON*; if they disagree, the differential parity
CI gate fails the build.

---

## Spin lifecycle — one canonical path, two implementations

```
        ┌────────────────────────────────────────────────────────────┐
        │                  IR document (USIF v1.0)                    │
        │     meta · topology · symbols · reels · evaluation          │
        │     paytable · features · rng · bet · limits · compliance   │
        └─────────────────────────┬──────────────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
         ┌─────────────────┐             ┌─────────────────┐
         │   TS engine     │             │   Rust engine   │
         │  src/engine/    │             │  rust-sim/src/  │
         └────────┬────────┘             └────────┬────────┘
                  │                               │
                  ▼                               ▼
        ┌───────────────────┐         ┌──────────────────────┐
        │ 1. Config load    │         │ 1. Config load       │
        │    irEvaluator.ts │         │    config.rs / ir/   │
        └────────┬──────────┘         └─────────┬────────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 2. RNG init        │        │ 2. RNG init         │
        │   src/rng/Factory  │        │   rust-sim/src/rng  │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 3. Reel sampling   │        │ 3. Reel sampling    │
        │    Mulberry32 /    │        │    PCG64 / Xoshiro  │
        │    PCG64 (parity)  │        │    / Philox4x32     │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 4. Grid build      │        │ 4. Grid build       │
        │   irEvaluator      │        │   grid.rs           │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 5. Wild transform  │        │ 5. Wild transform   │
        │   evaluators/wild* │        │   behavior/wild*    │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 6. Win evaluation  │        │ 6. Win evaluation   │
        │   lines / ways /   │        │   lines / ways /    │
        │   cluster /        │        │   cluster /         │
        │   pay_anywhere /   │        │   pay_anywhere /    │
        │   pattern /        │        │   pattern /         │
        │   variable_ways    │        │   variable_ways     │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 7. Feature engine  │        │ 7. Feature engine   │
        │   free_spins /     │        │   features.rs       │
        │   hold_and_win /   │        │                     │
        │   cascade / etc.   │        │                     │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 8. Jackpot rule    │        │ 8. Jackpot rule     │
        │   src/jackpot/     │        │   jackpot.rs        │
        └────────┬───────────┘        └─────────┬───────────┘
                 ▼                              ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │ 9. SpinResult      │        │ 9. SpinResult       │
        │   total win,       │        │   AtomicStats merge │
        │   features fired,  │        │                     │
        │   audit trace      │        │                     │
        └────────────────────┘        └─────────────────────┘
```

Steps 1–9 are **logically identical**; the parity test (`tests/
faza2_parity.test.ts`) runs both stacks on the same seed and asserts
RTP delta ≈ 0 within MC variance.

---

## Module ownership

### TS side — `src/`

| Module           | Responsibility                                                              |
|------------------|------------------------------------------------------------------------------|
| `core/`          | Decimal, BigInt, combinatorics — precision primitives (see `precision.md`)  |
| `ir/`            | IR loader, schema validator, kodgen entry point                              |
| `rng/`           | 4 pluggable backends: Mulberry32, PCG64, Xoshiro256SS, Philox4x32           |
| `engine/`        | `irEvaluator`, `irSimulator`, spin orchestrator                              |
| `evaluators/`    | Per-eval-mode win calculators                                                |
| `behaviors/`     | Symbol-kind plugins (wild, mystery, sticky, expanding, …)                    |
| `features/`      | Free spins, hold-and-win, cascade, retrigger, ante-bet, buy-feature          |
| `jackpot/`       | Multi-tier, must-hit-by, two-phase commit                                    |
| `calculator/`    | `rtpCalculator` — closed-form + MC                                           |
| `analytical/`    | Memoized exhaustive enumeration (Faza 14.1)                                  |
| `solver/`        | Inverse-RTP bisection, sensitivity (Faza 6.7)                                |
| `optimizer/`     | Reel strip optimizer, GA auto-tuner                                          |
| `simulator/`     | Public simulator façade                                                       |
| `usif/`          | USIF v1.0 schema object + structural validator                               |
| `converters/`    | Vendor-dialect → USIF importer (`reel_weight_map`, `weighted_pairs`, `reel_strips`) |
| `recall/`        | Per-spin journal + replay (Faza 8.5/11.6)                                    |
| `observability/` | Welford variance, Kahan sums, alerting (Faza 11.7)                           |
| `qrng/`          | Quantum RNG bridge (Faza 13.5)                                               |
| `crypto/`        | ChaCha20 commit-reveal (Faza 7.5)                                            |
| `zkproof/`       | zk-SNARK proof scaffold (Faza 13.4)                                          |
| `rg/`            | Responsible gaming hooks                                                      |
| `fraud/`         | Anti-fraud heuristics                                                         |
| `jurisdiction/`  | Per-jurisdiction adapter (UK / MGA / DE …)                                   |
| `protocols/`     | G2S / SAS / GAT-IV server protocol adapters                                  |

### Rust side — `rust-sim/src/`

| Module        | Responsibility                                                                |
|---------------|--------------------------------------------------------------------------------|
| `config.rs`   | JSON config loader (legacy native format)                                      |
| `ir/`         | IR loader (parity with TS)                                                     |
| `rng.rs`      | Same 4 backends as TS, plus SlotRng (Mulberry32) for byte-for-byte parity      |
| `grid.rs`     | Reel sampling + grid construction                                              |
| `evaluator.rs`| Lines / ways / cluster / variable_ways                                         |
| `behavior/`   | Symbol-kind plugin Trait + impls                                               |
| `features.rs` | Feature orchestrator                                                            |
| `simulator.rs`| Rayon parallel driver                                                          |
| `stats.rs`    | `AtomicStats` lock-free accumulator (Welford + Kahan)                          |
| `markov.rs`   | Closed-form chain solver                                                       |
| `analytical.rs`| Exhaustive enumeration                                                        |
| `par.rs`      | PAR sheet generator                                                            |
| `jackpot.rs`  | Two-phase commit                                                                |
| `protocols/`  | G2S / SAS / GAT-IV                                                              |
| `recall/`     | Spin journal — append-only hash-chain                                          |
| `speed/`      | SIMD f32x8 path, bitpacked grid, arena allocator                               |
| `bulk/`       | Megaspin batching helpers                                                       |
| `numa/`       | Topology detection + worker pinning (Faza 9.9)                                 |
| `gpu/`        | WGSL kernel (Faza 9.6)                                                          |
| `cluster/`    | TCP cluster transport for distributed sim (Faza 9.8)                           |
| `jurisdiction/`| Per-jurisdiction adapter                                                        |

---

## Determinism contract

1. **Same IR + same seed + same RNG kind ⇒ same SpinResult** across
   TS, Rust (debug), Rust (release), Rust (release+SIMD), Rust (GPU)
   modulo documented f64 boundaries (see `precision.md`).
2. **Mulberry32** is the legacy reference RNG retained for parity
   diff vs the TypeScript engine.
3. **PCG64** is the default for new IR configs.
4. **`split(nonce)`** is the only sanctioned way to spawn an
   independent stream — no per-worker seed splitting by ad-hoc hash.

---

## Where the lines blur

A few cross-cutting facilities live in both stacks intentionally:

- **Welford / Kahan accumulators** — implemented in TS
  (`statistics/welford.ts`) and Rust (`stats.rs`) so analytical CI in
  TS matches MC CI in Rust to ≥6 decimals.
- **Decimal arithmetic for paytable products** — TS uses `decimal.js`,
  Rust uses `rust_decimal`. Both honour the same rounding mode
  (`bankers`).
- **Audit hash chain** — SHA-256 chain identical on both stacks
  (test: `recall_kat.rs` + `tests/recall.test.ts`).

---

## Hot paths and where they leave the IR

The IR is the **source of truth**, but high-throughput simulation
specializes the IR into faster representations:

| Stage                         | Specialized form                                          |
|-------------------------------|-----------------------------------------------------------|
| Cold load                     | Parsed IR object (Zod / serde)                            |
| Warm Monte Carlo (Rust debug) | Borrowed `&IR` + per-worker arena                         |
| Hot Monte Carlo (Rust release)| `PackedGrid<u8>` + SIMD f32x8 win accumulator             |
| GPU                            | WGSL buffer of `u32` codes — IR translated at upload time |

Specialization is one-way; production reads never patch the IR.
Designer edits round-trip through the IR validator before being
re-specialized.

---

## Failure modes the architecture catches

- **TS↔Rust drift** — differential parity CI step (`ci.yml::parity`).
- **Reel strip / weight tampering** — IR validator + project-cache
  manifest (commit `aa4791b`).
- **Stale build with edited Cargo.toml** — manifest fingerprint
  invalidates cache on any tracked dependency file (`Cargo.toml`,
  `package.json`, `pubspec.yaml`, `pyproject.toml`, `tsconfig.json`,
  lockfiles).
- **Out-of-order recall** — append-only hash chain refuses any insert
  that breaks the prev-hash invariant.
