// Base game evaluation: paylines + Wild expansion + Volcano scatter +
// Pattern win + Free Spins trigger detection (Volcano).
//
// PAR-001 rules (lines 58..64):
//   - 20 lines fixed bet for 20 coins.
//   - Wild substitutes for all symbols except Fireball and Volcano.
//   - In the base game, Wild appears on reels 2,3,4,5 and EXPANDS to
//     fill the corresponding reel with Wild.
//   - Wild expansion only occurs if it results in a winning combo.
//   - 3+ Volcano scatters trigger Free Spins (scatter pay × total bet).
//   - 3 Red7 on reel 1 + 4 expanded Wilds on reels 2,3,4,5 = pattern win
//     1000× total bet (line wins NOT paid in addition).

use crate::ir::Ir;
use crate::reels::Grid;
use std::collections::HashMap;

/// Pre-compiled paytable for O(1) lookup during evaluation.
#[derive(Debug, Clone)]
pub struct CompiledPaytable {
    /// `lines[(symbol, count_of_a_kind)]` = pays per line.
    pub lines: HashMap<(String, u32), f64>,
    /// Volcano scatter pay (3+ in any position): count → pays × total bet.
    pub volcano: HashMap<u32, f64>,
    /// Pattern win (Red7 reel1 + 4 Wilds reels 2..5) pays × total bet.
    pub pattern_win_pays: f64,
}

impl CompiledPaytable {
    pub fn from_ir_base(ir: &Ir) -> Self {
        let mut lines = HashMap::new();
        let mut volcano = HashMap::new();
        let mut pattern_win = 0.0;
        for e in &ir.paytable {
            if e.combo.is_empty() {
                continue;
            }
            let first = &e.combo[0];
            if first.starts_with("Any ") && first.ends_with(" Volcano") {
                // "Any 3 Volcano" / "Any 4 Volcano" / "Any 5 Volcano"
                let count: u32 = first
                    .trim_start_matches("Any ")
                    .trim_end_matches(" Volcano")
                    .parse()
                    .expect("Volcano count parse");
                volcano.insert(count, e.pays);
                continue;
            }
            if first == "Pattern Win" {
                pattern_win = e.pays;
                continue;
            }
            // Standard N-of-a-kind: symbol repeated, padded with "--"
            let sym = first.clone();
            let count = e
                .combo
                .iter()
                .filter(|c| c.as_str() == sym.as_str())
                .count() as u32;
            lines.insert((sym, count), e.pays);
        }
        CompiledPaytable {
            lines,
            volcano,
            pattern_win_pays: pattern_win,
        }
    }

    pub fn from_ir_fs(ir: &Ir) -> Self {
        // FS paytable: only N-of-a-kind + Big Volcano (×total bet, treated
        // like a scatter pay separate from line wins).
        let mut lines = HashMap::new();
        let mut volcano = HashMap::new();
        for e in &ir.fs_paytable {
            if e.combo.is_empty() {
                continue;
            }
            let first = &e.combo[0];
            if first == "Big Volcano" {
                // "Big Volcano" pays N × total bet per occurrence — store as
                // count=1 sentinel; FG evaluator multiplies by occurrences.
                volcano.insert(1, e.pays);
                continue;
            }
            let sym = first.clone();
            let count = e
                .combo
                .iter()
                .filter(|c| c.as_str() == sym.as_str())
                .count() as u32;
            lines.insert((sym, count), e.pays);
        }
        CompiledPaytable {
            lines,
            volcano,
            pattern_win_pays: 0.0,
        }
    }
}

/// Result of evaluating one *base-game* spin.
///
/// Coin-wins are in **coins** (multiples of single-line bet = 1 coin),
/// scatter wins are in **total-bet multiples** (×20 coins). The driver
/// converts both to a common unit (total-bet multiples) before summing.
#[derive(Debug, Clone, Default)]
pub struct SpinWin {
    /// Sum of line wins in coins (1 coin per line, 20 coins = 1× total bet).
    pub line_coins: f64,
    /// Volcano scatter pay × total bet (already in total-bet units).
    pub volcano_total_bet_x: f64,
    /// Pattern win × total bet (already in total-bet units). When set,
    /// line wins are NOT counted (replaced by the pattern win).
    pub pattern_total_bet_x: f64,
    /// True iff this spin triggered Free Spins (3+ Volcano scatters).
    pub free_spins_triggered: bool,
    /// Count of Volcano scatters on the grid (0..15).
    pub volcano_count: u32,
    /// Count of Fireballs on the grid (used to trigger Cash Eruption).
    pub fireball_count: u32,
    /// True iff this spin is a pattern win (Red7 reel1 + 4 expanded Wilds).
    pub is_pattern_win: bool,
    /// True iff at least one line win OR scatter pay was awarded.
    pub is_hit: bool,
    /// True iff total payout > 0 (subset of `is_hit`).
    pub is_win: bool,
}

impl SpinWin {
    /// Final payout in **total-bet multiples** (so RTP = mean(payout)).
    /// 1 line coin = 1/20 of a total bet.
    pub fn payout_total_bet_x(&self) -> f64 {
        if self.is_pattern_win {
            // Pattern win replaces line wins per PAR rule.
            self.pattern_total_bet_x + self.volcano_total_bet_x
        } else {
            self.line_coins / 20.0 + self.volcano_total_bet_x
        }
    }
}

/// Counts of a symbol on a specific reel (used for scatter + Fireball gating).
fn count_on_grid(grid: &Grid, sym: &str) -> u32 {
    let mut c = 0u32;
    for r in 0..5 {
        for row in 0..3 {
            if grid.cells[r][row] == sym {
                c += 1;
            }
        }
    }
    c
}

/// Returns true if the named symbol appears on the given reel (any row).
fn any_on_reel(grid: &Grid, reel: usize, sym: &str) -> bool {
    (0..3).any(|row| grid.cells[reel][row] == sym)
}

/// Apply Wild expansion: per PAR-001 rule, if Wild appears anywhere on
/// reels 2/3/4/5, the entire reel becomes Wild *only if* the expansion
/// produces a winning combination. We compute both grids (raw + expanded)
/// and pick the higher line-pay total.
fn expand_wilds(base: &Grid) -> Grid {
    let mut g = base.clone();
    for reel in 1..5 {
        if any_on_reel(base, reel, "Wild") {
            for row in 0..3 {
                g.cells[reel][row] = "Wild".to_string();
            }
        }
    }
    g
}

/// Score the 20 paylines on a given grid. Wilds substitute for all
/// symbols *except* Fireball and Volcano (per PAR-001 line 59). Each
/// payline pays its longest left-anchored N-of-a-kind run (3..5) using
/// the higher of (own-symbol, wild-substituted) match.
fn score_paylines(grid: &Grid, ir: &Ir, pt: &CompiledPaytable) -> f64 {
    let mut total_coins = 0.0;
    for pl in &ir.paylines {
        // Row-per-reel windows for this payline:
        let cells: Vec<&str> = (0..5)
            .map(|r| {
                let row = pl.rows[r].expect("payline cell") as usize;
                grid.cells[r][row].as_str()
            })
            .collect();
        // Determine the "anchor" symbol: first non-Wild, non-special on the
        // leftmost positions. If the leftmost is Wild, treat as if leading
        // wilds count toward whatever the first non-wild symbol is.
        let mut symbol: Option<&str> = None;
        for c in &cells {
            if *c != "Wild" && *c != "Fireball" && *c != "Volcano" {
                symbol = Some(*c);
                break;
            }
        }
        // Leading wilds w/o anchor → no payable line (cash from Wild line is
        // handled below as the dedicated Wild N-of-a-kind row).
        if symbol.is_none() {
            // All Wild — treat as Wild N-of-a-kind across the run.
            let mut count = 0u32;
            for c in &cells {
                if *c == "Wild" {
                    count += 1;
                } else {
                    break;
                }
            }
            if let Some(p) = pt.lines.get(&("Wild".to_string(), count)) {
                total_coins += *p;
            }
            continue;
        }
        let sym = symbol.unwrap();
        // Count contiguous left-anchored matches of sym or Wild (subject to
        // wild exclusion list).
        let wild_subs = sym != "Fireball" && sym != "Volcano";
        let mut count = 0u32;
        for c in &cells {
            if *c == sym || (wild_subs && *c == "Wild") {
                count += 1;
            } else {
                break;
            }
        }
        // Also: leading wild run length (counts as Wild N-of-a-kind).
        let mut leading_wilds = 0u32;
        for c in &cells {
            if *c == "Wild" {
                leading_wilds += 1;
            } else {
                break;
            }
        }
        let own_pay = if count >= 3 {
            pt.lines
                .get(&(sym.to_string(), count))
                .copied()
                .unwrap_or(0.0)
        } else {
            0.0
        };
        let wild_pay = if leading_wilds >= 3 {
            pt.lines
                .get(&("Wild".to_string(), leading_wilds))
                .copied()
                .unwrap_or(0.0)
        } else {
            0.0
        };
        total_coins += own_pay.max(wild_pay);
    }
    total_coins
}

/// Volcano scatter pay (3/4/5 anywhere). Awarded × total bet.
fn score_volcano(grid: &Grid, pt: &CompiledPaytable) -> (u32, f64) {
    let n = count_on_grid(grid, "Volcano");
    let pays = pt.volcano.get(&n).copied().unwrap_or(0.0);
    (n, pays)
}

/// Detect a "Pattern Win": 3 Red7 on reel 1 (one per row) + 4 expanded
/// Wilds across reels 2,3,4,5. Returns true iff the pattern was hit.
fn is_pattern_win(base_grid: &Grid) -> bool {
    // Reel 1: all three rows must be Red7 (3 Red7 stacked).
    if (0..3).any(|row| base_grid.cells[0][row] != "Red7") {
        return false;
    }
    // Reels 2..5: each must have at least one Wild (so Wild expansion
    // turns them fully Wild).
    for reel in 1..5 {
        if !any_on_reel(base_grid, reel, "Wild") {
            return false;
        }
    }
    true
}

/// Full base-game spin evaluator. Returns `SpinWin` with all the bits
/// needed downstream (Cash Eruption trigger, Free Spins trigger, RTP).
pub fn evaluate_base_spin(base_grid: &Grid, ir: &Ir, pt: &CompiledPaytable) -> SpinWin {
    let mut w = SpinWin::default();
    let pattern = is_pattern_win(base_grid);
    w.is_pattern_win = pattern;
    if pattern {
        w.pattern_total_bet_x = pt.pattern_win_pays;
    }
    // Wild expansion grid for line evaluation (only if it would produce a
    // win — we compute both and take the better of the two).
    let raw_lines = score_paylines(base_grid, ir, pt);
    let expanded = expand_wilds(base_grid);
    let exp_lines = score_paylines(&expanded, ir, pt);
    let lines = raw_lines.max(exp_lines);
    if !pattern {
        w.line_coins = lines;
    }
    let (v_count, v_pay) = score_volcano(base_grid, pt);
    w.volcano_count = v_count;
    w.volcano_total_bet_x = v_pay;
    w.free_spins_triggered = v_count >= 3;
    w.fireball_count = count_on_grid(base_grid, "Fireball");
    let payout = w.payout_total_bet_x();
    // "Hit" = any paid spin (payout > 0). "Win" = net win
    // (payout > total bet, i.e. player walks away with more than wager).
    w.is_hit = payout > 0.0;
    w.is_win = payout > 1.0;
    w
}
