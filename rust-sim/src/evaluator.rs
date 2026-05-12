//! Win Evaluator Module (Faza 1.3)
//!
//! Multi-mode evaluator: Lines, Ways, Cluster, PayAnywhere.
//! The `EvalMode` enum selects the evaluation path; `Evaluator` is
//! constructed with one mode and dispatches accordingly in `evaluate_spin`.
//!
//! All grid iteration uses `config.reels` / `config.rows` — zero hardcoded
//! grid-size constants.

use crate::config::GameConfig;
use crate::grid::{Grid, GridGenerator};
use crate::rng::SlotRng;

// ─── EvalMode ──────────────────────────────────────────────────────────────

/// Evaluation mode — controls which algorithm `evaluate_spin` runs.
#[derive(Debug, Clone, PartialEq)]
pub enum EvalMode {
    /// Classic payline evaluation (left-to-right or both directions).
    Lines,
    /// All-ways evaluation: every combination of symbols across consecutive
    /// reels pays (no explicit paylines required).
    Ways,
    /// Cluster evaluation: connected groups of identical symbols pay if
    /// the group size reaches `min_size`.
    Cluster { min_size: u32 },
    /// Pay-anywhere evaluation: a symbol pays if it appears at least
    /// `min_count` times anywhere on the grid.
    PayAnywhere { min_count: u32 },
    /// Variable-ways: variable per-reel row counts. `row_counts[r]` holds
    /// the effective row count on reel `r` for this spin. Payout for a
    /// symbol matching on `N` consecutive reels equals
    /// `pay(symbol, N) × Π(count_per_reel[0..N])`, where each reel's
    /// count is the number of matching cells on that reel (wild included).
    VariableWays { row_counts: Vec<usize> },
}

// ─── Result types ───────────────────────────────────────────────────────────

/// Line win result
#[derive(Debug, Clone)]
pub struct LineWin {
    pub payline_id: u8,
    pub symbol_idx: u8,
    pub count: u8,
    pub payout: i64, // In millicredits
}

/// Spin evaluation result
#[derive(Debug, Clone, Default)]
pub struct SpinResult {
    pub line_wins: Vec<LineWin>,
    pub base_win: i64, // In millicredits
    pub multiplier: u32,
    pub final_win: i64, // In millicredits
    pub scatter_count: u8,
    pub bonus_count: u8,
    pub fs_triggered: bool,
    pub hnw_triggered: bool,
    pub fs_awarded: u8,
}

// ─── Evaluator ─────────────────────────────────────────────────────────────

/// Win evaluator — created once per simulation seed, shared across spins.
pub struct Evaluator<'a> {
    config: &'a GameConfig,
    grid_gen: &'a GridGenerator<'a>,
    /// Evaluation mode selected at construction time.
    pub eval_mode: EvalMode,
    /// Precomputed paytable: `[symbol_idx][count-3]` → payout millicredits.
    paytable: Vec<[i64; 3]>,
    /// Wild symbol index (if any).
    wild_idx: Option<u8>,
    /// Scatter symbol index (if any).
    scatter_idx: Option<u8>,
    /// Bonus symbol index (if any).
    bonus_idx: Option<u8>,
    /// Lightning multiplier weights: `(value, weight)`.
    lightning_weights: Vec<(u32, u32)>,
    lightning_total: u32,
}

impl<'a> Evaluator<'a> {
    /// Create a new evaluator from config.
    /// `eval_mode` defaults to `Lines` so existing callers work unchanged.
    pub fn new(config: &'a GameConfig, grid_gen: &'a GridGenerator<'a>) -> Self {
        Self::with_mode(config, grid_gen, EvalMode::Lines)
    }

    /// Create a new evaluator with an explicit `EvalMode`.
    pub fn with_mode(
        config: &'a GameConfig,
        grid_gen: &'a GridGenerator<'a>,
        eval_mode: EvalMode,
    ) -> Self {
        // Build paytable lookup indexed by [symbol_idx][count-3].
        let mut paytable = vec![[0i64; 3]; config.symbols.len()];
        for (sym_id, pay) in &config.paytable {
            if let Some(idx) = config.symbol_index(sym_id) {
                paytable[idx][0] = (pay.pay3 * 1000.0) as i64;
                paytable[idx][1] = (pay.pay4 * 1000.0) as i64;
                paytable[idx][2] = (pay.pay5 * 1000.0) as i64;
            }
        }

        let wild_idx = config
            .symbols
            .iter()
            .position(|s| s.is_wild)
            .map(|i| i as u8);
        let scatter_idx = config
            .symbols
            .iter()
            .position(|s| s.is_scatter)
            .map(|i| i as u8);
        let bonus_idx = config
            .symbols
            .iter()
            .position(|s| s.is_bonus)
            .map(|i| i as u8);

        let lightning_weights: Vec<(u32, u32)> = config
            .lightning
            .multipliers
            .iter()
            .map(|m| (m.value, m.weight))
            .collect();
        let lightning_total: u32 = lightning_weights.iter().map(|(_, w)| *w).sum();

        Evaluator {
            config,
            grid_gen,
            eval_mode,
            paytable,
            wild_idx,
            scatter_idx,
            bonus_idx,
            lightning_weights,
            lightning_total,
        }
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /// Returns `true` if the symbol blocks a payline (scatter or bonus).
    #[inline]
    fn blocks_line(&self, idx: u8) -> bool {
        Some(idx) == self.scatter_idx || Some(idx) == self.bonus_idx
    }

    /// Returns `true` if the symbol is wild.
    #[inline]
    fn is_wild(&self, idx: u8) -> bool {
        Some(idx) == self.wild_idx
    }

    /// Returns `true` if the symbol is scatter or bonus (special).
    #[inline]
    fn is_special(&self, idx: u8) -> bool {
        Some(idx) == self.scatter_idx || Some(idx) == self.bonus_idx
    }

    /// Payout for `(symbol, count)` in millicredits × 1 (unscaled by bet).
    #[inline]
    fn get_payout(&self, sym_idx: u8, count: u8) -> i64 {
        if count < 3 || count > 5 {
            return 0;
        }
        self.paytable
            .get(sym_idx as usize)
            .map(|p| p[(count - 3) as usize])
            .unwrap_or(0)
    }

    /// Pick lightning multiplier from weighted distribution.
    #[inline]
    fn pick_lightning(&self, rng: &mut SlotRng) -> u32 {
        let mut roll = rng.random() * self.lightning_total as f64;
        for (value, weight) in &self.lightning_weights {
            roll -= *weight as f64;
            if roll <= 0.0 {
                return *value;
            }
        }
        self.lightning_weights.last().map(|(v, _)| *v).unwrap_or(1)
    }

    // ─── Lines evaluator ─────────────────────────────────────────────────

    fn evaluate_payline(&self, grid: &Grid, payline_idx: usize) -> Option<LineWin> {
        let payline = &self.config.paylines[payline_idx];
        let num_reels = self.config.reels as usize;

        // Read symbols along this payline.
        let mut line_syms = vec![0u8; num_reels];
        for reel in 0..num_reels {
            let row = payline[reel] as usize;
            line_syms[reel] = grid.get(reel, row);
        }

        // If the first symbol blocks, no win possible.
        if self.blocks_line(line_syms[0]) {
            return None;
        }

        // Build consecutive chain length (stop at first blocker).
        let mut chain_len = 0usize;
        for reel in 0..num_reels {
            if self.blocks_line(line_syms[reel]) {
                break;
            }
            chain_len += 1;
        }

        if chain_len < 3 {
            return None;
        }

        // Find first non-wild paying symbol.
        let first_paying = (0..chain_len)
            .map(|r| line_syms[r])
            .find(|&sym| !self.is_wild(sym) && self.get_payout(sym, 3) > 0);

        let mut best: Option<LineWin> = None;

        if let Some(target) = first_paying {
            best = self.evaluate_target(&line_syms, chain_len, target, payline_idx);
        }

        // Try wild-only win.
        if let Some(wild) = self.wild_idx {
            if let Some(win) = self.evaluate_target(&line_syms, chain_len, wild, payline_idx) {
                if best.is_none() || win.payout > best.as_ref().unwrap().payout {
                    best = Some(win);
                }
            }
        }

        best
    }

    fn evaluate_target(
        &self,
        line_syms: &[u8],
        chain_len: usize,
        target: u8,
        payline_idx: usize,
    ) -> Option<LineWin> {
        let mut count = 0usize;
        for reel in 0..chain_len {
            let sym = line_syms[reel];
            if sym == target || self.is_wild(sym) {
                count += 1;
            } else {
                break;
            }
        }

        if count < 3 {
            return None;
        }

        let payout = self.get_payout(target, count as u8);
        if payout <= 0 {
            return None;
        }

        Some(LineWin {
            payline_id: payline_idx as u8 + 1,
            symbol_idx: target,
            count: count as u8,
            payout,
        })
    }

    fn evaluate_lines(&self, grid: &Grid, total_bet_mc: i64) -> (Vec<LineWin>, i64) {
        let mut wins = Vec::new();
        let mut total = 0i64;

        for i in 0..self.config.paylines.len() {
            if let Some(mut win) = self.evaluate_payline(grid, i) {
                win.payout = (win.payout * total_bet_mc) / 1000;
                total += win.payout;
                wins.push(win);
            }
        }

        (wins, total)
    }

    // ─── Ways evaluator ──────────────────────────────────────────────────
    //
    // All-ways: for each non-special symbol, find how many consecutive reels
    // from left contain at least one instance (wild counts).  Payout =
    // pay(sym, consec_reels) × product(count_on_each_reel).
    //
    // Implementation: iterate reels left-to-right accumulating a set of
    // active (symbol, combo_count) pairs; multiply combo count by the number
    // of matching positions (including wilds) on each new reel.

    fn evaluate_ways(&self, grid: &Grid, total_bet_mc: i64) -> (Vec<LineWin>, i64) {
        let num_reels = self.config.reels as usize;
        let mut total_win = 0i64;
        let mut wins: Vec<LineWin> = Vec::new();

        let num_syms = self.config.symbols.len();

        for sym_idx in 0..num_syms as u8 {
            // Skip wilds and specials — they participate as multipliers.
            if self.is_wild(sym_idx) || self.is_special(sym_idx) {
                continue;
            }

            // Count matching positions per reel (symbol OR wild).
            let mut reel_counts: Vec<u32> = Vec::with_capacity(num_reels);
            for reel in 0..num_reels {
                let row_count = grid.rows_for_reel(reel);
                let mut hits = 0u32;
                for row in 0..row_count {
                    let cell = grid.get(reel, row);
                    if cell == sym_idx || self.is_wild(cell) {
                        hits += 1;
                    }
                }
                reel_counts.push(hits);
            }

            // Find consecutive reel span from left.
            let mut consec = 0usize;
            let mut combo: u64 = 1;
            for reel in 0..num_reels {
                if reel_counts[reel] == 0 {
                    break;
                }
                consec += 1;
                combo = combo.saturating_mul(reel_counts[reel] as u64);
            }

            if consec < 3 {
                continue;
            }

            let base_pay = self.get_payout(sym_idx, consec as u8);
            if base_pay <= 0 {
                continue;
            }

            // Scale: payout × ways_combo / rows (normalise to per-line equivalent).
            // Standard ways math: total_payout = pay(sym, N) × ways
            // where ways = Π(hits_per_reel[0..N]).
            // We scale by total_bet_mc/1000 to convert from per-unit to bet.
            let raw_win = (base_pay as i64)
                .saturating_mul(combo as i64)
                .saturating_mul(total_bet_mc)
                / 1000;

            if raw_win > 0 {
                total_win += raw_win;
                wins.push(LineWin {
                    payline_id: sym_idx + 1,
                    symbol_idx: sym_idx,
                    count: consec as u8,
                    payout: raw_win,
                });
            }
        }

        (wins, total_win)
    }

    // ─── Cluster evaluator ───────────────────────────────────────────────
    //
    // BFS from every cell to find connected groups of identical symbols.
    // Orthogonal adjacency (left, right, up, down).  Groups below `min_size`
    // do not pay.  Each cell is counted in at most one group (visited mask).

    fn evaluate_cluster(
        &self,
        grid: &Grid,
        min_size: u32,
        total_bet_mc: i64,
    ) -> (Vec<LineWin>, i64) {
        let num_reels = self.config.reels as usize;
        let num_rows = self.config.rows as usize;
        let mut visited = vec![vec![false; num_rows]; num_reels];
        let mut wins: Vec<LineWin> = Vec::new();
        let mut total_win = 0i64;

        for start_reel in 0..num_reels {
            for start_row in 0..grid.rows_for_reel(start_reel) {
                if visited[start_reel][start_row] {
                    continue;
                }

                let sym = grid.get(start_reel, start_row);
                if self.is_special(sym) || self.is_wild(sym) {
                    visited[start_reel][start_row] = true;
                    continue;
                }

                // BFS — orthogonal adjacency.
                let mut group_size = 0u32;
                let mut queue: Vec<(usize, usize)> = vec![(start_reel, start_row)];
                visited[start_reel][start_row] = true;

                while let Some((reel, row)) = queue.pop() {
                    if grid.get(reel, row) == sym {
                        group_size += 1;
                        // Neighbours: left, right, up, down.
                        let neighbours = [
                            (reel.wrapping_sub(1), row),
                            (reel + 1, row),
                            (reel, row.wrapping_sub(1)),
                            (reel, row + 1),
                        ];
                        for (nr, nrow) in neighbours {
                            if nr < num_reels
                                && nrow < grid.rows_for_reel(nr)
                                && !visited[nr][nrow]
                                && grid.get(nr, nrow) == sym
                            {
                                visited[nr][nrow] = true;
                                queue.push((nr, nrow));
                            }
                        }
                    }
                }

                if group_size < min_size {
                    continue;
                }

                // Look up pay: try exact key then "N+" catch-all.
                // Cluster paytable uses pay(sym, size) stored in PayEntry pay3/4/5.
                // For cluster we normalise: pay3 = 3-match, pay4 = 4-match, pay5 = 5+
                // (mirroring how the paytable was loaded from IR).
                let base_pay = self.get_payout(sym, group_size.min(5) as u8);
                if base_pay <= 0 {
                    continue;
                }

                let win = base_pay.saturating_mul(total_bet_mc) / 1000;
                if win > 0 {
                    total_win += win;
                    wins.push(LineWin {
                        payline_id: wins.len() as u8 + 1,
                        symbol_idx: sym,
                        count: group_size as u8,
                        payout: win,
                    });
                }
            }
        }

        (wins, total_win)
    }

    // ─── Variable-ways evaluator ─────────────────────────────────────────
    //
    // Variable-row ways: each reel has its own `row_counts[reel]` value for
    // this spin. The win logic is otherwise identical to all-ways:
    //   pay(symbol, N) × Π(count_on_reel[0..N])
    // where count_on_reel counts the symbol plus wilds on that reel.
    //
    // The reel iteration uses `row_counts` (passed via
    // `EvalMode::VariableWays`) rather than `grid.rows_for_reel(reel)` so
    // callers can decouple the *configured* row count from the actual
    // `DynGrid` layout. The two should normally match.

    fn evaluate_variable_ways(
        &self,
        grid: &Grid,
        row_counts: &[usize],
        total_bet_mc: i64,
    ) -> (Vec<LineWin>, i64) {
        let num_reels = self.config.reels as usize;
        let mut total_win = 0i64;
        let mut wins: Vec<LineWin> = Vec::new();
        let num_syms = self.config.symbols.len();

        for sym_idx in 0..num_syms as u8 {
            // Skip wilds and specials — they participate as multipliers.
            if self.is_wild(sym_idx) || self.is_special(sym_idx) {
                continue;
            }

            // Count matching positions per reel honouring per-spin row counts.
            let mut reel_counts: Vec<u32> = Vec::with_capacity(num_reels);
            for reel in 0..num_reels {
                let row_count = row_counts
                    .get(reel)
                    .copied()
                    .unwrap_or_else(|| grid.rows_for_reel(reel));
                let mut hits = 0u32;
                for row in 0..row_count {
                    let cell = grid.get(reel, row);
                    if cell == sym_idx || self.is_wild(cell) {
                        hits += 1;
                    }
                }
                reel_counts.push(hits);
            }

            // Consecutive reel span from the left.
            let mut consec = 0usize;
            let mut combo: u64 = 1;
            for reel in 0..num_reels {
                if reel_counts[reel] == 0 {
                    break;
                }
                consec += 1;
                combo = combo.saturating_mul(reel_counts[reel] as u64);
            }

            if consec < 3 {
                continue;
            }

            // Variable-ways pays the highest band the chain reached: get_payout
            // only defines pay3..pay5, so clamp at 5 — every consec ≥ 5
            // pays the pay5 band.
            let pay_band = consec.min(5) as u8;
            let base_pay = self.get_payout(sym_idx, pay_band);
            if base_pay <= 0 {
                continue;
            }

            let raw_win = (base_pay as i64)
                .saturating_mul(combo as i64)
                .saturating_mul(total_bet_mc)
                / 1000;

            if raw_win > 0 {
                total_win += raw_win;
                wins.push(LineWin {
                    payline_id: sym_idx + 1,
                    symbol_idx: sym_idx,
                    count: consec as u8,
                    payout: raw_win,
                });
            }
        }

        (wins, total_win)
    }

    /// Total ways for a variable-ways spin: Π(row_counts[r]).
    /// Exposed for callers that want to log it alongside the result.
    pub fn variable_ways_total(row_counts: &[usize]) -> u64 {
        row_counts
            .iter()
            .copied()
            .map(|c| c as u64)
            .fold(1u64, |acc, c| acc.saturating_mul(c))
    }

    // ─── PayAnywhere evaluator ───────────────────────────────────────────
    //
    // Count total appearances of each symbol across all cells.
    // Pay if count ≥ min_count.  Uses the same PayEntry table.

    fn evaluate_pay_anywhere(
        &self,
        grid: &Grid,
        min_count: u32,
        total_bet_mc: i64,
    ) -> (Vec<LineWin>, i64) {
        let num_reels = self.config.reels as usize;
        let num_syms = self.config.symbols.len();
        let mut counts = vec![0u32; num_syms];

        for reel in 0..num_reels {
            let row_count = grid.rows_for_reel(reel);
            for row in 0..row_count {
                let sym = grid.get(reel, row) as usize;
                if sym < num_syms {
                    counts[sym] += 1;
                }
            }
        }

        let mut wins: Vec<LineWin> = Vec::new();
        let mut total_win = 0i64;

        for (sym_idx, &count) in counts.iter().enumerate() {
            let sym = sym_idx as u8;
            if self.is_wild(sym) || self.is_special(sym) {
                continue;
            }
            if count < min_count {
                continue;
            }

            let base_pay = self.get_payout(sym, count.min(5) as u8);
            if base_pay <= 0 {
                continue;
            }

            let win = base_pay.saturating_mul(total_bet_mc) / 1000;
            if win > 0 {
                total_win += win;
                wins.push(LineWin {
                    payline_id: wins.len() as u8 + 1,
                    symbol_idx: sym,
                    count: count as u8,
                    payout: win,
                });
            }
        }

        (wins, total_win)
    }

    // ─── Public entry point ──────────────────────────────────────────────

    /// Evaluate a full spin and return the aggregated `SpinResult`.
    pub fn evaluate_spin(
        &self,
        grid: &Grid,
        rng: &mut SlotRng,
        total_bet_mc: i64,
        is_free_spin: bool,
        disable_lightning: bool,
    ) -> SpinResult {
        let mut result = SpinResult::default();

        // Dispatch to the correct evaluation mode.
        let (line_wins, base_win) = match &self.eval_mode {
            EvalMode::Lines => self.evaluate_lines(grid, total_bet_mc),
            EvalMode::Ways => self.evaluate_ways(grid, total_bet_mc),
            EvalMode::Cluster { min_size } => self.evaluate_cluster(grid, *min_size, total_bet_mc),
            EvalMode::PayAnywhere { min_count } => {
                self.evaluate_pay_anywhere(grid, *min_count, total_bet_mc)
            }
            EvalMode::VariableWays { row_counts } => {
                self.evaluate_variable_ways(grid, row_counts, total_bet_mc)
            }
        };

        result.line_wins = line_wins;
        result.base_win = base_win;

        // Count special symbols (grid-wide, evaluation-mode-agnostic).
        result.scatter_count = self.grid_gen.count_scatters(grid);
        result.bonus_count = self.grid_gen.count_bonus(grid);

        // Feature trigger checks.
        if result.bonus_count >= self.config.hold_and_win.trigger_count {
            result.hnw_triggered = true;
        } else if result.scatter_count >= 3 {
            result.fs_triggered = true;
            result.fs_awarded = *self
                .config
                .free_spins
                .awards
                .get(&result.scatter_count)
                .unwrap_or(&10);
        }

        // Lightning multiplier (on winning base spins only).
        result.multiplier = 1;
        if !disable_lightning && result.base_win > 0 && self.lightning_total > 0 {
            let chance = if is_free_spin {
                self.config.lightning.trigger_chance_fs
            } else {
                self.config.lightning.trigger_chance
            };

            if rng.random() < chance {
                result.multiplier = self.pick_lightning(rng);
            }
        }

        result.final_win = result.base_win * result.multiplier as i64;
        result
    }
}
