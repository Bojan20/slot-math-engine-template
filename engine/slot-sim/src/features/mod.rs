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

use crate::evaluate::{CompiledPaytable, SpinWin};
use crate::ir::{Feature, Ir};
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;

#[derive(Debug, Clone, Default)]
pub struct FeatureOutcome {
    /// Coins added by this feature (1/lines of total bet = 1 coin/line).
    pub coins: f64,
    /// Triggered events (e.g. CE-from-base, FS triggered, GRAND hit).
    pub events: Vec<String>,
}

impl FeatureOutcome {
    fn merge(&mut self, other: FeatureOutcome) {
        self.coins += other.coins;
        self.events.extend(other.events);
    }
}

/// Per-spin feature dispatch (W4.3c).
///
/// Walks the IR's feature list in declaration order. Each variant routes to
/// its own module runner. Sub-feature spawning (e.g. FS inside hold-and-win)
/// is owned by the individual runner — this dispatcher only handles the
/// top-level fire decisions.
pub fn run_features(
    ir: &Ir,
    grid: &Grid,
    base: &SpinWin,
    bet_multiplier: i64,
    rng: &mut Prng,
    fs_picker: Option<&ReelSetPicker>,
    pt: &CompiledPaytable,
    virtual_mode: bool,
    fs_pt: Option<&CompiledPaytable>,
) -> FeatureOutcome {
    let mut out = FeatureOutcome::default();
    for feat in &ir.features {
        match feat {
            Feature::FreeSpins {
                trigger_symbol,
                trigger_count_min,
                initial_spins,
                retrigger_spins,
                max_total_spins,
                reel_bank: _,
                linked_reels,
                fs_paytable: _,
            } => {
                let Some(picker) = fs_picker else { continue };
                // W4.8 — look up any HoldAndWin feature in the IR to
                // know if CE-from-FS should be triggered inside FS spins.
                // Prefer `fs_trigger_prob` / `fs_avg_pay_per_trigger` when
                // populated (Cash Eruption pages publish a separate
                // `ce_from_fs_rtp` value driving these); fall back to the
                // base trigger config otherwise.
                let fs_hw = ir.features.iter().find_map(|f| match f {
                    Feature::HoldAndWin {
                        trigger_symbol,
                        trigger_count_min,
                        trigger_prob,
                        avg_pay_per_trigger,
                        fs_trigger_prob,
                        fs_avg_pay_per_trigger,
                        ..
                    } => Some(free_spins::FsHoldAndWinCfg {
                        trigger_symbol,
                        trigger_count_min: *trigger_count_min,
                        trigger_prob: fs_trigger_prob.or(*trigger_prob),
                        avg_pay_per_trigger: fs_avg_pay_per_trigger.or(*avg_pay_per_trigger),
                    }),
                    _ => None,
                });
                let params = free_spins::FreeSpinsParams {
                    trigger_symbol,
                    trigger_count_min: *trigger_count_min,
                    initial_spins: *initial_spins,
                    retrigger_spins: *retrigger_spins,
                    max_total_spins: *max_total_spins,
                    fs_pt,
                    linked_reels: linked_reels.as_deref(),
                    fs_hold_and_win: fs_hw,
                };
                out.merge(free_spins::run(params, ir, picker, pt, base, rng, virtual_mode));
            }
            Feature::PickBonus {
                trigger_symbol,
                trigger_count_min,
                awards,
                trigger_prob,
            } => {
                let params = pick_bonus::PickBonusParams {
                    trigger_symbol,
                    trigger_count_min: *trigger_count_min,
                    awards,
                    trigger_prob: *trigger_prob,
                };
                out.merge(pick_bonus::run(params, ir, base, rng));
            }
            Feature::LinearProgressive {
                odds_at_bm1,
                top_award_coins,
            } => {
                let params = linear_progressive::LinearProgressiveParams {
                    odds_at_bm1: *odds_at_bm1,
                    top_award_coins: *top_award_coins,
                };
                out.merge(linear_progressive::run(params, ir, bet_multiplier, base, rng));
            }
            Feature::HoldAndWin {
                trigger_symbol,
                trigger_count_min,
                respins: _,
                pages: _,
                trigger_prob,
                avg_pay_per_trigger,
                fs_trigger_prob: _,
                fs_avg_pay_per_trigger: _,
            } => {
                let params = hold_and_win::HoldAndWinParams {
                    trigger_symbol,
                    trigger_count_min: *trigger_count_min,
                    trigger_prob: *trigger_prob,
                    avg_pay_per_trigger: *avg_pay_per_trigger,
                };
                out.merge(hold_and_win::run(params, ir, base, rng));
            }
            Feature::PatternWin {
                anchor_symbol,
                anchor_count,
                anchor_reel,
                required_wild_reels,
                pays,
            } => {
                let params = pattern_win::PatternWinParams {
                    anchor_symbol,
                    anchor_count: *anchor_count,
                    anchor_reel: *anchor_reel,
                    required_wild_reels,
                    pays: *pays,
                };
                out.merge(pattern_win::run(&params, ir, grid, base, rng));
            }
            // WildExpand / GrandPrize remain future waves.
            _ => {}
        }
    }
    out
}
