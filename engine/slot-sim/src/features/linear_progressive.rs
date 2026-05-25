//! W4.3c — Linear Progressive jackpot runner (Wolf Run style).
//!
//! Per-spin Bernoulli sample: P(hit) = `bet_multiplier / odds_at_bm1`.
//! Awards `top_award_coins` (when known) or 0 (silent placeholder when the
//! prize value is not exposed in the PAR sheet). Linear-progressive odds
//! scale 1-to-1 with the bet multiplier, so a BM=300 spin has 300× the hit
//! probability of a BM=1 spin while the prize stays fixed.

use crate::evaluate::SpinWin;
use crate::features::FeatureOutcome;
use crate::ir::{Evaluation, Ir};
use crate::rng::Prng;

#[derive(Debug, Clone, Copy)]
pub struct LinearProgressiveParams {
    pub odds_at_bm1: f64,
    pub top_award_coins: Option<i64>,
}

pub fn run(
    params: LinearProgressiveParams,
    ir: &Ir,
    bet_multiplier: i64,
    _base: &SpinWin,
    rng: &mut Prng,
) -> FeatureOutcome {
    let mut out = FeatureOutcome::default();
    if params.odds_at_bm1 <= 0.0 || bet_multiplier <= 0 {
        return out;
    }
    let p_hit = (bet_multiplier as f64) / params.odds_at_bm1;
    if rng.gen_f64() >= p_hit {
        return out;
    }
    let award_coins = params.top_award_coins.unwrap_or(0);
    if award_coins <= 0 {
        out.events.push("progressive_hit:silent".into());
        return out;
    }
    let lines = lines_of(ir);
    // top_award is in coin units total; feat.coins is per-line so multiply
    // by lines for the engine's `coins / lines` to give total-bet × award.
    out.coins += (award_coins as f64) * (lines as f64);
    out.events.push(format!("progressive_hit:{}", award_coins));
    out
}

fn lines_of(ir: &Ir) -> u32 {
    match &ir.evaluation {
        Evaluation::Lines { lines, .. } => lines.len() as u32,
        _ => ir.bet_table.lines,
    }
}
