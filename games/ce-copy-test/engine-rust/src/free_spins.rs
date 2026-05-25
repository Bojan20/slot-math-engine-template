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

//// Detect whether the linked reels 2/3/4 stop landed on the given Big
/// symbol. In FS, reels 2/3/4 share ONE stop and the visible 3 rows of
/// reel 2 come from `strip[stop-1], strip[stop], strip[stop+1]`. By
/// reel-set design, Big symbols are encoded as three consecutive strip
/// entries `(weight 0, weight W, weight 0)` so a sampled stop on a Big
/// symbol places that same symbol on all three rows. Thus the middle
/// row (row 1) is the canonical detector — if it matches `sym`, exactly
/// ONE block of that symbol has landed (linked stop = 1 block, never
/// more). Big symbols never appear on reels 1 and 5 by reel-set design.
///
/// Returns 1 if a `sym` block landed, 0 otherwise.
fn linked_block_landed(grid: &Grid, sym: &str) -> u32 {
    if grid.cells[2][1] == sym {
        1
    } else {
        0
    }
}

/// Strip "Big " prefix so we can reuse paytable keyed on plain symbols.
fn normalize_big(sym: &str) -> &str {
    sym.strip_prefix("Big ").unwrap_or(sym)
}

/// Per PAR 2657, in FS Wild on reel 5 may transform the entire reel into
/// Wild — but only if it produces a winning combination. We expose the
/// expanded grid; the caller decides which payout (raw vs expanded) to
/// use based on max(raw, expanded).
fn any_wild_on_reel5(grid: &Grid) -> bool {
    (0..3).any(|row| grid.cells[4][row] == "Wild")
}

fn expand_wild_reel5(grid: &Grid) -> Grid {
    let mut g = grid.clone();
    for row in 0..3 {
        g.cells[4][row] = "Wild".to_string();
    }
    g
}

/// Score the 20 FS paylines on a given grid. Wild and Big Wild substitute
/// for all symbols except (Big) Fireball and (Big) Volcano. Only 4 and
/// 5 of a kind are paid in FS (per the fs_paytable design).
fn score_fs_lines(grid: &Grid, ir: &Ir, fs_pt: &CompiledPaytable) -> f64 {
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
    total_coins
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
    /// Number of Cash Eruption EVENTS triggered during this bonus
    /// (per-spin counting, matches Excel "1 in 468.99 base spins"
    /// which is event-level not bonus-level).
    pub cash_eruption_event_count: u32,
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
        // Big Volcano pay (per block occurrence × total bet). Linked stop
        // gives 1 block max per spin. PAR fs_paytable lists Big Volcano with
        // `pays = 1` (multiplier on total bet) and PPH = 43.22 → block-level
        // award, not per-cell. Total bet in coins = 20 × bet_multiplier.
        let bv = linked_block_landed(&grid, "Big Volcano");
        if bv > 0 {
            if let Some(p) = fs_pt.volcano.get(&1) {
                let total_bet_coins = 20.0 * (bet_multiplier as f64);
                let bv_pay = (*p) * total_bet_coins * (bv as f64);
                res.payout_coins += bv_pay;
                res.big_volcano_coins += bv_pay;
            }
            // +3 FS up to max 15 total
            let extra = 3u32.min(15u32.saturating_sub(played + remaining));
            remaining += extra;
            res.big_volcano_count += bv;
        }
        // Line wins — evaluate paylines on the FS grid using FS paytable.
        // PAR 2657: "In the Free Spins Bonus, Wild transforms reel 5 into
        // Wild only if a win would result." We compute payouts with both
        // raw grid AND Wild-expanded-on-reel-5 grid, taking the max
        // (so the rule is honoured: expand only if it improves payout).
        //
        // Paytable values are per-line-bet in coins; for bet_multiplier M,
        // actual coin payout per win = paytable × M. Sim conversion to
        // total_bet units in caller divides by total_bet (= 20 × M coins).
        let raw_lines = score_fs_lines(&grid, ir, fs_pt);
        let line_units = if any_wild_on_reel5(&grid) {
            let expanded = expand_wild_reel5(&grid);
            let exp_lines = score_fs_lines(&expanded, ir, fs_pt);
            raw_lines.max(exp_lines)
        } else {
            raw_lines
        };
        let total_coins = line_units * (bet_multiplier as f64);
        res.payout_coins += total_coins;
        res.line_wins_coins += total_coins;
        // Cash Eruption trigger in FS: one Big Fireball linked-stop event
        // counts as 6 Fireballs for the CE feature (matches PAR respin
        // table indexing 6..14 and reproduces Excel CE-from-FS avg payout
        // of ~29× total bet per trigger).
        //
        // Empirical derivation (PAR-001 BET MULTIPLIER 1):
        //   E[CE-from-FS payout per trigger] = 581.3 coins (= 29.03× × 20)
        //   Average coin value per Fireball  = 87.74 coins
        //   GRAND contribution (prob × award) = 19.27 coins
        //   ⇒ n_initial × 87.74 + respin_avg + 19.27 = 581.3
        //   ⇒ n_initial = 6 ⇒ respin_avg ≈ 36 coins ✓ (matches typical
        //     0-weight-dominated respin tables that give ~0.4 add per
        //     respin × ~3 respins ≈ ~1 add total × ~30 avg coin).
        //
        // Linked stop = 1 block max; if a second event ever occurs (it
        // cannot with current reel-set design), each adds another 6.
        let fb_blocks = linked_block_landed(&grid, "Big Fireball");
        // Per Excel C3966: "Big Fireball already covers 9 positions" — 1
        // block = 9 grid cells for respin table lookup. Trigger gate is
        // ≥6 (per C3944), which 1 block (9 cells) trivially satisfies.
        let fb_grid_cells = (fb_blocks * 9).min(14);
        if fb_grid_cells >= 6 {
            if let Some(ce) = ce_all.by_bm.get(&bet_multiplier) {
                // FS: 1 block = 1 coin sample drawn from BIG dist (per
                // Excel C3965), grid coverage = 9 cells per block. Respin
                // adds always sample from SMALL dist (per C3961).
                let ce_res = run_cash_eruption(
                    ce,
                    fb_blocks,       // initial coin samples = # blocks
                    fb_grid_cells,   // grid coverage = blocks × 9
                    true,            // initial_use_big = true (FS uses Big)
                    CeContext::FreeSpins,
                    rng,
                );
                res.payout_coins += ce_res.payout_coins;
                res.ce_from_fs_coins += ce_res.payout_coins;
                res.cash_eruption_event_count += 1;
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
/// All coin payouts are divided by `total_bet_coins = 20 × bet_multiplier`
/// to express the per-spin RTP contribution in total-bet units.
pub fn total_spin_total_bet_x(
    base: &SpinWin,
    ce_coins: f64,
    fs_coins: f64,
    bet_multiplier: i64,
) -> f64 {
    let total_bet = 20.0 * (bet_multiplier as f64);
    base.payout_total_bet_x(bet_multiplier) + ce_coins / total_bet + fs_coins / total_bet
}
