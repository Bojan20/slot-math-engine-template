// Feature dispatch — registry of compiled feature handlers + per-spin runner.
//
// IR `features: [Feature]` list is iterated in order; each feature has a
// trigger condition (checked against per-spin role counts) and a runner that
// returns a `FeatureOutcome` (coin payout + spawned sub-features).

pub mod hold_and_win;
pub mod pick_bonus;
pub mod free_spins;
pub mod wild_expand;
pub mod pattern_win;
pub mod linear_progressive;

use crate::evaluate::SpinWin;
use crate::ir::Ir;
use crate::reels::Grid;
use crate::rng::Prng;

#[derive(Debug, Clone, Default)]
pub struct FeatureOutcome {
    /// Coins added by this feature (1/lines of total bet = 1 coin/line).
    pub coins: f64,
    /// Triggered events (e.g. CE-from-base, FS triggered, GRAND hit).
    pub events: Vec<String>,
}

/// Dispatches every active feature for one spin. Stub — full implementations
/// in `hold_and_win.rs` / `pick_bonus.rs` / etc.
pub fn run_features(
    _ir: &Ir,
    _grid: &Grid,
    _base: &SpinWin,
    _bet_multiplier: i64,
    _rng: &mut Prng,
) -> FeatureOutcome {
    // TODO Wave 4.2: per-Feature variant dispatch
    FeatureOutcome::default()
}
