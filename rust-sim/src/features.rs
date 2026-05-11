//! Feature Implementations
//!
//! Free Spins with Progressive Multiplier
//! Hold & Win with Jackpot Orbs

use crate::config::GameConfig;
use crate::evaluator::Evaluator;
use crate::grid::{Grid, GridGenerator};
use crate::rng::SlotRng;

/// Free Spins result
#[derive(Debug, Clone, Default)]
pub struct FSResult {
    pub total_payout: i64, // In millicredits
    pub spins_played: u32,
    pub retriggers: u32,
    pub max_mult_reached: u32,
    pub scatter_wins: i64, // In millicredits
}

/// Hold & Win orb
#[derive(Debug, Clone)]
pub struct HNWOrb {
    pub reel: u8,
    pub row: u8,
    pub value: u32, // Multiplier value
    pub jackpot: Option<String>,
}

/// Hold & Win result
#[derive(Debug, Clone, Default)]
pub struct HNWResult {
    pub total_payout: i64, // In millicredits
    pub total_respins: u32,
    pub final_orb_count: u8,
    pub full_grid_bonus: bool,
    pub jackpots_mini: u32,
    pub jackpots_minor: u32,
    pub jackpots_major: u32,
    pub jackpots_grand: u32,
}

/// Feature simulator
pub struct FeatureSim<'a> {
    config: &'a GameConfig,
    grid_gen: &'a GridGenerator<'a>,
    evaluator: &'a Evaluator<'a>,
    /// Precomputed orb weights: (value, weight, jackpot)
    orb_weights: Vec<(u32, u32, Option<String>)>,
    orb_total_weight: u32,
}

impl<'a> FeatureSim<'a> {
    pub fn new(
        config: &'a GameConfig,
        grid_gen: &'a GridGenerator<'a>,
        evaluator: &'a Evaluator<'a>,
    ) -> Self {
        let orb_weights: Vec<(u32, u32, Option<String>)> = config
            .hold_and_win
            .orb_values
            .iter()
            .map(|o| (o.value, o.weight, o.jackpot.clone()))
            .collect();
        let orb_total_weight: u32 = orb_weights.iter().map(|(_, w, _)| *w).sum();

        FeatureSim {
            config,
            grid_gen,
            evaluator,
            orb_weights,
            orb_total_weight,
        }
    }

    /// Generate orb value
    #[inline]
    fn generate_orb(&self, rng: &mut SlotRng) -> (u32, Option<String>) {
        let mut roll = rng.random() * self.orb_total_weight as f64;

        for (value, weight, jackpot) in &self.orb_weights {
            roll -= *weight as f64;
            if roll <= 0.0 {
                return (*value, jackpot.clone());
            }
        }

        (1, None)
    }

    /// Simulate Free Spins
    pub fn simulate_free_spins(
        &self,
        rng: &mut SlotRng,
        scatter_count: u8,
        total_bet_mc: i64,
    ) -> FSResult {
        let mut result = FSResult::default();

        // Get initial spins
        let mut spins_remaining = *self
            .config
            .free_spins
            .awards
            .get(&scatter_count)
            .unwrap_or(&10) as u32;

        let mut current_mult = self.config.free_spins.mult_start;
        let max_mult = self.config.free_spins.mult_max;
        let max_win_mc = (self.config.max_win_cap * 1000.0) as i64 * total_bet_mc / 1000;

        // Scatter pay from trigger
        if let Some(&scatter_pay) = self.config.free_spins.scatter_pays.get(&scatter_count) {
            let pay = (scatter_pay * 1000.0) as i64 * total_bet_mc / 1000;
            result.total_payout += pay;
            result.scatter_wins += pay;
        }

        let mut loop_count = 0;
        while spins_remaining > 0 && loop_count < self.config.feature_loop_cap {
            loop_count += 1;
            spins_remaining -= 1;
            result.spins_played += 1;

            // Generate FS grid
            let grid = self.grid_gen.generate_fs(rng);

            // Check retrigger
            let scatters = self.grid_gen.count_scatters(&grid);
            if self.config.free_spins.retrigger_enabled && scatters >= 3 {
                let additional = *self.config.free_spins.awards.get(&scatters).unwrap_or(&0) as u32;
                spins_remaining += additional;
                result.retriggers += 1;

                // Scatter pay on retrigger
                if let Some(&scatter_pay) = self.config.free_spins.scatter_pays.get(&scatters) {
                    let pay =
                        (scatter_pay * 1000.0) as i64 * total_bet_mc / 1000 * current_mult as i64;
                    result.total_payout += pay;
                    result.scatter_wins += pay;
                }
            }

            // Evaluate spin (no lightning in FS)
            let spin_result = self.evaluator.evaluate_spin(
                &grid,
                rng,
                total_bet_mc,
                true, // is_free_spin
                true, // disable_lightning
            );

            // Apply progressive multiplier
            if spin_result.base_win > 0 {
                result.total_payout += spin_result.base_win * current_mult as i64;

                // Increment multiplier
                if current_mult < max_mult {
                    current_mult += self.config.free_spins.mult_increment;
                    result.max_mult_reached = result.max_mult_reached.max(current_mult);
                }
            }

            // Check max win cap
            if result.total_payout >= max_win_mc {
                result.total_payout = max_win_mc;
                break;
            }
        }

        result.max_mult_reached = result.max_mult_reached.max(current_mult);
        result
    }

    /// Simulate Hold & Win
    pub fn simulate_hnw(
        &self,
        rng: &mut SlotRng,
        initial_grid: &Grid,
        total_bet_mc: i64,
    ) -> HNWResult {
        let num_reels = self.config.reels as usize;
        let num_rows = self.config.rows as usize;
        let total_cells = num_reels * num_rows;

        let mut result = HNWResult::default();
        // Flatten occupied into a Vec<Vec<bool>> so dimensions come from config.
        let mut occupied = vec![vec![false; num_rows]; num_reels];
        let mut orb_values: Vec<(u8, u8, u32)> = Vec::with_capacity(total_cells);

        let max_win_mc = (self.config.max_win_cap * 1000.0) as i64 * total_bet_mc / 1000;

        // Place initial orbs from the triggering grid.
        for reel in 0..num_reels {
            for row in 0..num_rows {
                if self.grid_gen.is_bonus(initial_grid.get(reel, row)) {
                    occupied[reel][row] = true;
                    let (value, jackpot) = self.generate_orb(rng);
                    orb_values.push((reel as u8, row as u8, value));

                    if let Some(j) = &jackpot {
                        match j.to_uppercase().as_str() {
                            "MINI" => result.jackpots_mini += 1,
                            "MINOR" => result.jackpots_minor += 1,
                            "MAJOR" => result.jackpots_major += 1,
                            "GRAND" => result.jackpots_grand += 1,
                            _ => {}
                        }
                    }
                }
            }
        }

        let mut respins_remaining = self.config.hold_and_win.initial_respins;
        let mut loop_count = 0;
        let mut orb_count: u8 = orb_values.len() as u8;
        let total_cells_u8 = total_cells as u8;

        // Respin loop — stop when grid is full or respins exhausted.
        while respins_remaining > 0
            && orb_count < total_cells_u8
            && loop_count < self.config.feature_loop_cap
        {
            loop_count += 1;
            respins_remaining -= 1;
            result.total_respins += 1;

            let mut new_orbs = 0;

            // Each empty cell has a chance to land an orb.
            let fill_ratio = orb_count as f64 / total_cells as f64;
            let orb_chance = self.config.hold_and_win.orb_land_chance_base
                + fill_ratio * self.config.hold_and_win.orb_land_chance_fill_bonus;

            for reel in 0..num_reels {
                for row in 0..num_rows {
                    if occupied[reel][row] {
                        continue;
                    }

                    if rng.random() < orb_chance {
                        occupied[reel][row] = true;
                        orb_count += 1;
                        new_orbs += 1;

                        let (value, jackpot) = self.generate_orb(rng);
                        orb_values.push((reel as u8, row as u8, value));

                        if let Some(j) = &jackpot {
                            match j.to_uppercase().as_str() {
                                "MINI" => result.jackpots_mini += 1,
                                "MINOR" => result.jackpots_minor += 1,
                                "MAJOR" => result.jackpots_major += 1,
                                "GRAND" => result.jackpots_grand += 1,
                                _ => {}
                            }
                        }
                    }
                }
            }

            // Reset respins counter when new orbs land.
            if new_orbs > 0 {
                respins_remaining = self.config.hold_and_win.respins_on_new_orb;
            }
        }

        // Calculate payout
        for (_, _, value) in &orb_values {
            result.total_payout += *value as i64 * total_bet_mc;
        }

        // Full grid bonus
        result.final_orb_count = orb_count;
        if orb_count >= total_cells_u8 {
            result.full_grid_bonus = true;
            result.total_payout +=
                (self.config.hold_and_win.full_grid_bonus * 1000.0) as i64 * total_bet_mc / 1000;
        }

        // Apply max win cap
        if result.total_payout > max_win_mc {
            result.total_payout = max_win_mc;
        }

        result
    }
}
