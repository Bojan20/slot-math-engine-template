// Free Spins Bonus — Cash Eruption rules.
//
// PAR rules (line 2653..2660 of PAR-001.tsv):
//   - 3+ Volcano scatters trigger FS; 6 initial free spins awarded.
//   - During FS, reels 2,3,4 are LINKED and spin as one. Symbols on the
//     linked block are 3 rows × 3 cols Big symbols (so reel set 2..4 in
//     FG has Big-* symbol names with weight 0/1/0 to model the
//     row-of-three placement).
//   - Big Wild substitutes for everything except Big Volcano + Big
//     Fireball. In FS, Wild transforms reel 5 into Wild only if a win
//     would result.
//   - Big Volcano awards +3 additional free spins (max 15 per bonus).
//   - Bonus ends when 0 free spins remain (or 15 played).
//
// Implementation note: the FG reel sets in IR already model the linked
// 2/3/4 reels (their stops emit Big_X symbols). We treat reels 2,3,4 as
// independent sources of the same Big symbol family but with the
// per-reel-set weight tables — this matches the Excel "3 wide" linkage
// since the same Big symbol fills all three columns when triggered.
//
// For Big Volcano scatter pay, PAR shows "Big Volcano 1 PPH 43.22 RTP 2.31%"
// per single FS — we award the pay × total_bet for each Big Volcano
// occurrence on the linked block.

use crate::base_game::{CompiledPaytable, SpinWin};
use crate::cash_eruption::{run_cash_eruption, CeContext, CompiledCeAll};
use crate::ir::Ir;
use crate::reels::{Grid, ReelSetPicker};
use crate::rng::Prng;

/// Count Big-symbol BLOCK occurrences on the linked reels 2/3/4. The
/// three reels share one stop so any "Big X" cell appears across all
/// three reels at the same row — we count once per ROW where the linked
/// middle column shows the symbol. Big symbols never appear on reels
/// 1 and 5 by reel-set design.
fn count_big_blocks(grid: &Grid, sym: &str) -> u32 {
    let mut c = 0;
    for row in 0..3 {
        if grid.cells[2][row] == sym {
            c += 1;
        }
    }
    c
}

/// Count occurrences of small (non-Big) symbols across the full grid
/// (e.g. plain "Wild" on reel 5 in FS, scatter detection if needed).
fn count_grid_eq(grid: &Grid, sym: &str) -> u32 {
    let mut c = 0;
    for r in 0..5 {
        for row in 0..3 {
            if grid.cells[r][row] == sym {
                c += 1;
            }
        }
    }
    c
}

/// Strip "Big " prefix so we can reuse paytable keyed on plain symbols.
fn normalize_big(sym: &str) -> &str {
    sym.strip_prefix("Big ").unwrap_or(sym)
}

#[derive(Debug, Clone, Default)]
pub struct FsResult {
    /// Total FS payout in coins (line wins + Big Volcano + Cash Eruption from FS).
    pub payout_coins: f64,
    /// Breakdown: line wins only.
    pub line_wins_coins: f64,
    /// Breakdown: Big Volcano scatter pays only.
    pub big_volcano_coins: f64,
    /// Breakdown: Cash Eruption (from FS) payout only.
    pub ce_from_fs_coins: f64,
    pub spins_played: u32,
    pub big_volcano_count: u32,
    pub cash_eruption_triggered_in_fs: bool,
    pub grand_hit: bool,
}

pub fn run_free_spins(
    ir: &Ir,
    fg_picker: &ReelSetPicker,
    fs_pt: &CompiledPaytable,
    ce_all: &CompiledCeAll,
    bet_multiplier: i64,
    rng: &mut Prng,
) -> FsResult {
    let mut res = FsResult::default();
    let mut remaining = 6u32;
    let mut played = 0u32;
    while remaining > 0 && played < 15 {
        let rs = fg_picker.pick(rng);
        let grid = Grid::spin_fs_linked(rs, rng);
        played += 1;
        remaining -= 1;
        // Big Volcano pay (per block occurrence × total bet)
        let bv = count_big_blocks(&grid, "Big Volcano");
        if bv > 0 {
            if let Some(p) = fs_pt.volcano.get(&1) {
                // pays × total bet × occurrences. 1 total bet = 20 coins.
                let bv_pay = (*p) * 20.0 * (bv as f64);
                res.payout_coins += bv_pay;
                res.big_volcano_coins += bv_pay;
            }
            // +3 FS up to max 15 total
            let extra = 3u32.min(15u32.saturating_sub(played + remaining));
            remaining += extra;
            res.big_volcano_count += bv;
        }
        // Line wins — evaluate paylines on the FS grid using FS paytable
        // (use normalized symbol name so paytable lookup works on "Bell"
        // even when grid cell is "Big Bell").
        let mut total_coins = 0.0f64;
        for pl in &ir.paylines {
            let cells: Vec<&str> = (0..5)
                .map(|r| {
                    let row = pl.rows[r].expect("payline cell") as usize;
                    grid.cells[r][row].as_str()
                })
                .collect();
            // First non-Wild, non-special symbol (normalized).
            let mut symbol: Option<&str> = None;
            for c in &cells {
                let n = normalize_big(c);
                if n != "Wild" && n != "Fireball" && n != "Volcano" {
                    symbol = Some(n);
                    break;
                }
            }
            if symbol.is_none() {
                continue;
            }
            let sym = symbol.unwrap();
            let mut count = 0u32;
            for c in &cells {
                let n = normalize_big(c);
                if n == sym || n == "Wild" {
                    count += 1;
                } else {
                    break;
                }
            }
            if count >= 4 {
                if let Some(p) = fs_pt.lines.get(&(sym.to_string(), count)) {
                    total_coins += *p;
                }
            }
        }
        res.payout_coins += total_coins;
        res.line_wins_coins += total_coins;
        // Cash Eruption trigger in FS: ≥6 Big Fireballs as a *grid total*
        // (each block occurrence covers 9 cells, but the PAR feature
        // table indexes are 6..15 — so we count block occurrences × 3
        // [3-wide] for the trigger gate, capped at 15 since the 3×3
        // grid has max 5 blocks → 15 cells).
        let fb_blocks = count_big_blocks(&grid, "Big Fireball");
        let fb = (fb_blocks * 3).min(15);
        if fb >= 6 {
            if let Some(ce) = ce_all.by_bm.get(&bet_multiplier) {
                let ce_res = run_cash_eruption(ce, fb, CeContext::FreeSpins, rng);
                res.payout_coins += ce_res.payout_coins;
                res.ce_from_fs_coins += ce_res.payout_coins;
                res.cash_eruption_triggered_in_fs = true;
                if ce_res.grand_hit {
                    res.grand_hit = true;
                }
            }
        }
    }
    res.spins_played = played;
    res
}

/// Public helper for stitching base-game `SpinWin` + FS results into a
/// per-spin total. Caller is responsible for averaging over many spins.
pub fn total_spin_total_bet_x(base: &SpinWin, ce_coins: f64, fs_coins: f64) -> f64 {
    base.payout_total_bet_x() + ce_coins / 20.0 + fs_coins / 20.0
}
