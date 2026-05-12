//! Faza 3 — Symbol Behavior Plugin Layer (Rust)
//!
//! Mirrors `src/behaviors/` in TypeScript.
//!
//! ## Modules
//!
//! - `types`    — Effect enum, SpinState, BehaviorContext, SymbolBehavior trait
//! - `pipeline` — apply_effect, apply_effects, tick_locked_positions
//! - `impls`    — 11 behavior implementations (Wild, Expanding, Sticky, ...)
//! - `registry` — BehaviorRegistry

pub mod types;
pub mod pipeline;
pub mod impls;
pub mod registry;

// Convenient re-exports
pub use types::{
    Effect, EffectScope, SpinState, LockedPosition, CollectedCoin,
    BehaviorContext, SymbolBehavior,
};
pub use pipeline::{
    apply_effect, apply_effects,
    tick_locked_positions, restore_locked_positions,
};
pub use registry::BehaviorRegistry;
