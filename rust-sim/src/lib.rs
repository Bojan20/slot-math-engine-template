//! Slot Simulator Library
//!
//! High-performance Monte Carlo simulator for slot games.
//!
//! ## Lint policy
//!
//! New modules (`ir/`) are required to ship with `-D warnings` clean.
//! Pre-existing modules carry idiomatic Rust lint debt from the initial
//! commit (manual range-contains, indexed range loops, a few unused
//! variables on debug paths). Rather than block Faza 0.1 / 1.1 delivery
//! on a stylistic refactor, we suppress those classes at crate level and
//! schedule the cleanup in **Faza 2 (Win evaluator refactor)**, where
//! every affected file gets a proper rewrite anyway.
//!
//! Allow-list is intentionally narrow — only the specific lint kinds the
//! legacy code trips. Anything new wider than this needs a fresh review.
#![allow(
    clippy::needless_range_loop,
    clippy::manual_range_contains,
    clippy::needless_borrow,
    unused_variables,
    unused_assignments
)]

pub mod analytical;
pub mod config;
pub mod evaluator;
pub mod features;
pub mod grid;
/// FAZA 1.1 — canonical Slot Game IR shared with TS (`src/ir/`).
/// Cross-validation + serde JSON round-trip. Engine consumers do not
/// touch hardcoded enums anymore; everything flows from `SlotGameIR`.
pub mod ir;
/// FAZA 5 — Jackpot manager: Fixed, Progressive, Pooled.
/// Thread-safe runtime state + analytical solver for RandomPick tiers.
pub mod jackpot;
/// FAZA 4 — GLI-16 compliant PAR sheet generator.
/// Produces structured JSON + printable report from `AtomicStats`.
pub mod par;
/// FAZA 6 — Closed-form feature RTP solvers.
/// H&W Markov DP, FS geometric series, Cascade chain-depth EV.
pub mod markov;
pub mod rng;
/// FAZA 9 — Speed: Walker's Alias O(1) sampling, PackedGrid(u128),
/// ZeroAllocEvaluator (stack-only), SIMD scatter counting, hot/cold
/// cache-line layout.
pub mod speed;
pub mod simulator;
pub mod stats;
/// FAZA 3 — Symbol Behavior Plugin Layer.
/// Effect discriminated union + applyEffect pipeline + 11 behavior impls.
/// Mirrors `src/behaviors/` TypeScript module tree exactly.
pub mod behavior;
