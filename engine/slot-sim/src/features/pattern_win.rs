//! W4.6 — Pattern Win runner (L&W CE Red7 pattern).
//!
//! Standard L&W "pattern win" geometry: `anchor_count` anchor symbols
//! (e.g. 3 Red7) all on reel `anchor_reel` (typically reel 0) PLUS Wild
//! visible on every reel in `required_wild_reels`. When the condition
//! holds, pays `pays` × total bet (replacing any line-win on that spin —
//! semantics already encoded in `SpinWin::payout_total_bet_x`).
//!
//! The runner is **read-only** with respect to `SpinWin.line_coins`:
//! it sets `is_pattern_win = true` and adds `pattern_total_bet_x = pays`.
//! The Engine driver picks pattern OR line via the existing payout
//! convention.

use crate::evaluate::SpinWin;
use crate::features::FeatureOutcome;
use crate::ir::{Ir, SymbolRole};
use crate::reels::Grid;
use crate::rng::Prng;

#[derive(Debug, Clone)]
pub struct PatternWinParams<'a> {
    pub anchor_symbol: &'a str,
    pub anchor_count: u32,
    pub anchor_reel: u32,
    pub required_wild_reels: &'a [u32],
    pub pays: f64,
}

pub fn run(
    params: &PatternWinParams,
    ir: &Ir,
    grid: &Grid,
    _base: &SpinWin,
    _rng: &mut Prng,
) -> FeatureOutcome {
    let mut out = FeatureOutcome::default();

    let anchor_reel = params.anchor_reel as usize;
    if anchor_reel >= grid.reels() {
        return out;
    }

    // Count anchor symbol on the anchor reel (all visible rows).
    let mut anchor_on_reel: u32 = 0;
    for row in 0..grid.rows() {
        if grid.cell(anchor_reel, row) == params.anchor_symbol {
            anchor_on_reel += 1;
        }
    }
    if anchor_on_reel < params.anchor_count {
        return out;
    }

    // Verify wild visible on each required reel.
    let wild_id = ir
        .symbols
        .iter()
        .find(|s| s.role == SymbolRole::Wild)
        .map(|s| s.id.as_str());
    let Some(wild) = wild_id else { return out };
    for &reel_u in params.required_wild_reels {
        let r = reel_u as usize;
        if r >= grid.reels() {
            return out;
        }
        let mut found = false;
        for row in 0..grid.rows() {
            if grid.cell(r, row) == wild {
                found = true;
                break;
            }
        }
        if !found {
            return out;
        }
    }

    // Pattern fires — the engine's `payout_total_bet_x` convention adds
    // pattern_total_bet_x for this spin. We expose the pay via `coins`
    // so the dispatcher can add it to feat.coins and let the engine
    // divide-back to total-bet-×.
    let lines = lines_of(ir);
    out.coins += params.pays * (lines as f64);
    out.events.push(format!("pattern_win:{}", params.anchor_symbol));
    out
}

fn lines_of(ir: &Ir) -> u32 {
    use crate::ir::Evaluation;
    match &ir.evaluation {
        Evaluation::Lines { lines, .. } => lines.len() as u32,
        _ => ir.bet_table.lines,
    }
}
