//! Slot Simulator Library
//!
//! High-performance Monte Carlo simulator for slot games.
//!
//! ## Lint policy
//!
//! Package-wide lint allow-list lives in `Cargo.toml` `[lints]` so it
//! applies uniformly across `lib`, `bin`, `tests/`, and `examples/`.
//! New modules (`ir/`, `recall/`) ship `-D warnings` clean; the older
//! evaluator/simulator/speed paths trip a narrow set of pedantic
//! clippy lints scheduled for the Faza 2 cleanup pass.

pub mod analytical;
/// FAZA 3 — Symbol Behavior Plugin Layer.
/// Effect discriminated union + applyEffect pipeline + 11 behavior impls.
/// Mirrors `src/behaviors/` TypeScript module tree exactly.
pub mod behavior;
/// FAZA 9.8 — Bulk dispatcher for 1T-spin runs.
/// Constant-memory chunked execution + progress + checkpoint/resume.
pub mod bulk;
/// FAZA 9.8 — Cluster mode: coordinator + worker over a transport
/// abstraction. Partitions a `BulkConfig` across N workers, merges
/// slice results back into a single `AtomicStats`.
pub mod cluster;
pub mod config;
pub mod evaluator;
pub mod features;
/// FAZA 9.8b — GPU compute scaffold (Metal / WGSL).
/// Phase-A: public surface + shader source + dispatch contract.
/// Real wgpu integration lands in 9.8b under `feature = "gpu"`.
pub mod gpu;
pub mod grid;
/// FAZA 1.1 — canonical Slot Game IR shared with TS (`src/ir/`).
/// Cross-validation + serde JSON round-trip. Engine consumers do not
/// touch hardcoded enums anymore; everything flows from `SlotGameIR`.
pub mod ir;
/// FAZA 5 — Jackpot manager: Fixed, Progressive, Pooled.
/// Thread-safe runtime state + analytical solver for RandomPick tiers.
pub mod jackpot;
/// FAZA 6 — Closed-form feature RTP solvers.
/// H&W Markov DP, FS geometric series, Cascade chain-depth EV.
pub mod markov;
/// FAZA 4 — GLI-16 compliant PAR sheet generator.
/// Produces structured JSON + printable report from `AtomicStats`.
pub mod par;
/// FAZA 8.5 — Spin Recall & Replay.
/// Hash-chained NDJSON journal + sha256 canonical-JSON integrity +
/// deterministic replay. Cross-language KAT in `tests/recall_kat.rs`
/// pins the canonical hash so TS and Rust journals are interchangeable.
pub mod recall;
pub mod rng;
pub mod simulator;
/// FAZA 9 — Speed: Walker's Alias O(1) sampling, PackedGrid(u128),
/// ZeroAllocEvaluator (stack-only), SIMD scatter counting, hot/cold
/// cache-line layout.
pub mod speed;
pub mod stats;
/// FAZA 11.9 — Jurisdiction adapter: compliance validation + auto-fix.
pub mod jurisdiction;
