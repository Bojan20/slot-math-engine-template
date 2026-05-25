//! W4.9 — Wild expansion runner (L&W CE base game).
//!
//! L&W CE PAR-001 documents:
//!     "In the base game, Wild appears on reels 2,3,4,5 and EXPANDS to
//!      fill the corresponding reel with Wild.
//!      Wild expansion only occurs if it results in a winning combo."
//!
//! Runner behavior:
//!   1. Iterate `on_reels` (e.g. [1,2,3,4] = reels 2-5 in 0-indexed).
//!   2. For each such reel that contains a Wild symbol in the visible
//!      window, create a hypothetical grid clone with the entire reel
//!      filled with Wild.
//!   3. Re-evaluate line wins on the expanded grid.
//!   4. Return the DELTA (expanded_line_coins − original_line_coins) so
//!      the engine adds only the incremental contribution. If `only_if
//!      _winning` is set and delta ≤ 0, return 0 (don't expand when it
//!      would lower payout).

use crate::evaluate::{evaluate_lines, CompiledPaytable, SpinWin};
use crate::features::FeatureOutcome;
use crate::ir::{Evaluation, Ir, SymbolRole};
use crate::reels::Grid;
use crate::rng::Prng;

#[derive(Debug, Clone)]
pub struct WildExpandParams<'a> {
    pub wild_symbol: &'a str,
    pub on_reels: &'a [u32],
    pub only_if_winning: bool,
}

pub fn run(
    params: &WildExpandParams,
    ir: &Ir,
    grid: &Grid,
    base: &SpinWin,
    pt: &CompiledPaytable,
    _rng: &mut Prng,
) -> FeatureOutcome {
    let mut out = FeatureOutcome::default();
    if !matches!(&ir.evaluation, Evaluation::Lines { .. }) {
        return out;
    }
    if params.on_reels.is_empty() {
        return out;
    }

    let wild_id = ir
        .symbols
        .iter()
        .find(|s| s.role == SymbolRole::Wild)
        .map(|s| s.id.as_str())
        .unwrap_or(params.wild_symbol);

    let rows = grid.rows();
    let mut to_expand: Vec<usize> = Vec::new();
    for &reel_u in params.on_reels {
        let r = reel_u as usize;
        if r >= grid.reels() {
            continue;
        }
        for row in 0..rows {
            if grid.cell(r, row) == wild_id {
                to_expand.push(r);
                break;
            }
        }
    }
    if to_expand.is_empty() {
        return out;
    }

    let mut expanded = grid.clone();
    for r in &to_expand {
        for row in 0..rows {
            expanded.cells[*r][row] = wild_id.to_string();
        }
    }

    let expanded_win = evaluate_lines(&expanded, ir, pt);
    let delta = expanded_win.line_coins - base.line_coins;

    if params.only_if_winning && delta <= 0.0 {
        return out;
    }
    if delta > 0.0 {
        out.coins += delta;
        out.events.push(format!("wild_expand:{}", to_expand.len()));
    }
    out
}
