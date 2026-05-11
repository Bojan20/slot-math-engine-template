//! Win Evaluator Module
//!
//! Evaluates payline wins, scatter pays, and feature triggers.

use crate::config::GameConfig;
use crate::grid::{Grid, GridGenerator};
use crate::rng::SlotRng;

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

/// Win evaluator
pub struct Evaluator<'a> {
    config: &'a GameConfig,
    grid_gen: &'a GridGenerator<'a>,
    /// Precomputed: paytable as [symbol_idx][count-3] -> payout in millicredits
    paytable: Vec<[i64; 3]>,
    /// Wild symbol index
    wild_idx: Option<u8>,
    /// Scatter symbol index
    scatter_idx: Option<u8>,
    /// Bonus symbol index
    bonus_idx: Option<u8>,
    /// Lightning multiplier weights: (value, weight)
    lightning_weights: Vec<(u32, u32)>,
    lightning_total: u32,
}

impl<'a> Evaluator<'a> {
    /// Create new evaluator from config
    pub fn new(config: &'a GameConfig, grid_gen: &'a GridGenerator<'a>) -> Self {
        // Build paytable lookup
        let mut paytable = vec![[0i64; 3]; config.symbols.len()];

        for (sym_id, pay) in &config.paytable {
            if let Some(idx) = config.symbol_index(sym_id) {
                // Convert to millicredits (x1000)
                paytable[idx][0] = (pay.pay3 * 1000.0) as i64;
                paytable[idx][1] = (pay.pay4 * 1000.0) as i64;
                paytable[idx][2] = (pay.pay5 * 1000.0) as i64;
            }
        }

        // Find special symbol indices
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

        // Precompute lightning weights
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
            paytable,
            wild_idx,
            scatter_idx,
            bonus_idx,
            lightning_weights,
            lightning_total,
        }
    }

    /// Check if symbol blocks payline (scatter or bonus)
    #[inline]
    fn blocks_line(&self, idx: u8) -> bool {
        Some(idx) == self.scatter_idx || Some(idx) == self.bonus_idx
    }

    /// Check if symbol is wild
    #[inline]
    fn is_wild(&self, idx: u8) -> bool {
        Some(idx) == self.wild_idx
    }

    /// Get payout for symbol and count (returns millicredits per bet unit)
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

    /// Evaluate single payline
    fn evaluate_payline(&self, grid: &Grid, payline_idx: usize) -> Option<LineWin> {
        let payline = &self.config.paylines[payline_idx];

        // Get symbols on this payline
        let mut line_syms = [0u8; 5];
        for reel in 0..5 {
            let row = payline[reel] as usize;
            line_syms[reel] = grid[reel][row];
        }

        // If first symbol blocks, no win
        if self.blocks_line(line_syms[0]) {
            return None;
        }

        // Build chain of consecutive symbols
        let mut chain_len = 0;
        for reel in 0..5 {
            if self.blocks_line(line_syms[reel]) {
                break;
            }
            chain_len += 1;
        }

        if chain_len < 3 {
            return None;
        }

        // Find candidates: first non-wild paying symbol, or wild
        let mut best_result: Option<LineWin> = None;

        // Try first non-wild symbol
        let mut first_paying: Option<u8> = None;
        for reel in 0..chain_len {
            let sym = line_syms[reel];
            if !self.is_wild(sym) && self.get_payout(sym, 3) > 0 {
                first_paying = Some(sym);
                break;
            }
        }

        // Evaluate first paying symbol
        if let Some(target) = first_paying {
            if let Some(win) =
                self.evaluate_target(grid, payline, &line_syms, chain_len, target, payline_idx)
            {
                best_result = Some(win);
            }
        }

        // Evaluate wild-only wins
        if let Some(wild) = self.wild_idx {
            if let Some(win) =
                self.evaluate_target(grid, payline, &line_syms, chain_len, wild, payline_idx)
            {
                if best_result.is_none() || win.payout > best_result.as_ref().unwrap().payout {
                    best_result = Some(win);
                }
            }
        }

        best_result
    }

    /// Evaluate payline for specific target symbol
    fn evaluate_target(
        &self,
        _grid: &Grid,
        _payline: &[u8],
        line_syms: &[u8; 5],
        chain_len: usize,
        target: u8,
        payline_idx: usize,
    ) -> Option<LineWin> {
        let mut count = 0;

        for reel in 0..chain_len {
            let sym = line_syms[reel];
            // Matches if symbol equals target OR symbol is wild
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

    /// Pick lightning multiplier
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

    /// Evaluate full spin
    pub fn evaluate_spin(
        &self,
        grid: &Grid,
        rng: &mut SlotRng,
        total_bet_mc: i64, // Total bet in millicredits
        is_free_spin: bool,
        disable_lightning: bool,
    ) -> SpinResult {
        let mut result = SpinResult::default();

        // Evaluate all paylines
        for i in 0..self.config.paylines.len() {
            if let Some(mut win) = self.evaluate_payline(grid, i) {
                // Scale payout by total bet
                win.payout = (win.payout * total_bet_mc) / 1000;
                result.base_win += win.payout;
                result.line_wins.push(win);
            }
        }

        // Count special symbols
        result.scatter_count = self.grid_gen.count_scatters(grid);
        result.bonus_count = self.grid_gen.count_bonus(grid);

        // Check feature triggers
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

        // Lightning multiplier (only on winning spins, base game)
        result.multiplier = 1;
        if !disable_lightning && result.base_win > 0 {
            let chance = if is_free_spin {
                self.config.lightning.trigger_chance_fs
            } else {
                self.config.lightning.trigger_chance
            };

            if rng.random() < chance {
                result.multiplier = self.pick_lightning(rng);
            }
        }

        // Calculate final win
        result.final_win = result.base_win * result.multiplier as i64;

        result
    }
}
