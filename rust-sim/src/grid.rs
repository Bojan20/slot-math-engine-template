//! Grid Generation Module
//!
//! Generates 5x3 slot grids from weighted reel strips.

use crate::config::GameConfig;
use crate::rng::SlotRng;

/// 5x3 grid represented as [reel][row]
pub type Grid = [[u8; 3]; 5];

/// Grid generator
pub struct GridGenerator<'a> {
    config: &'a GameConfig,
    /// Precomputed: base game weights per reel as (symbol_index, weight)
    base_weights: Vec<Vec<(u8, u32)>>,
    /// Precomputed: free spins weights per reel
    fs_weights: Vec<Vec<(u8, u32)>>,
    /// Total weights per reel (base)
    base_totals: Vec<u32>,
    /// Total weights per reel (FS)
    fs_totals: Vec<u32>,
}

impl<'a> GridGenerator<'a> {
    /// Create new grid generator from config
    pub fn new(config: &'a GameConfig) -> Self {
        let mut base_weights = Vec::with_capacity(5);
        let mut fs_weights = Vec::with_capacity(5);
        let mut base_totals = Vec::with_capacity(5);
        let mut fs_totals = Vec::with_capacity(5);

        // Precompute weights for each reel
        for reel in 0..5 {
            // Base game weights
            let mut reel_weights = Vec::new();
            let mut total = 0u32;

            if let Some(weights) = config.base_weights.get(reel) {
                for entry in weights {
                    if let Some(idx) = config.symbol_index(&entry.symbol) {
                        reel_weights.push((idx as u8, entry.weight));
                        total += entry.weight;
                    }
                }
            }

            base_weights.push(reel_weights);
            base_totals.push(total);

            // Free spins weights
            let mut reel_weights = Vec::new();
            let mut total = 0u32;

            if let Some(weights) = config.fs_weights.get(reel) {
                for entry in weights {
                    if let Some(idx) = config.symbol_index(&entry.symbol) {
                        reel_weights.push((idx as u8, entry.weight));
                        total += entry.weight;
                    }
                }
            }

            fs_weights.push(reel_weights);
            fs_totals.push(total);
        }

        GridGenerator {
            config,
            base_weights,
            fs_weights,
            base_totals,
            fs_totals,
        }
    }

    /// Generate base game grid
    #[inline]
    pub fn generate_base(&self, rng: &mut SlotRng) -> Grid {
        self.generate_grid(rng, false)
    }

    /// Generate free spins grid (no bonus orbs)
    #[inline]
    pub fn generate_fs(&self, rng: &mut SlotRng) -> Grid {
        self.generate_grid(rng, true)
    }

    /// Generate grid with specified weights
    #[inline]
    fn generate_grid(&self, rng: &mut SlotRng, is_fs: bool) -> Grid {
        let mut grid: Grid = [[0; 3]; 5];
        let weights = if is_fs { &self.fs_weights } else { &self.base_weights };
        let totals = if is_fs { &self.fs_totals } else { &self.base_totals };

        for reel in 0..5 {
            let reel_weights = &weights[reel];
            let total = totals[reel];

            if total == 0 {
                continue;
            }

            // Generate 3 symbols for this reel
            for row in 0..3 {
                let mut roll = rng.random() * total as f64;

                for (sym_idx, weight) in reel_weights {
                    roll -= *weight as f64;
                    if roll <= 0.0 {
                        grid[reel][row] = *sym_idx;
                        break;
                    }
                }
            }
        }

        grid
    }

    /// Get symbol ID from index
    #[inline]
    pub fn symbol_id(&self, idx: u8) -> &str {
        self.config.symbols.get(idx as usize)
            .map(|s| s.id.as_str())
            .unwrap_or("?")
    }

    /// Check if symbol is wild
    #[inline]
    pub fn is_wild(&self, idx: u8) -> bool {
        self.config.symbols.get(idx as usize)
            .map(|s| s.is_wild)
            .unwrap_or(false)
    }

    /// Check if symbol is scatter
    #[inline]
    pub fn is_scatter(&self, idx: u8) -> bool {
        self.config.symbols.get(idx as usize)
            .map(|s| s.is_scatter)
            .unwrap_or(false)
    }

    /// Check if symbol is bonus
    #[inline]
    pub fn is_bonus(&self, idx: u8) -> bool {
        self.config.symbols.get(idx as usize)
            .map(|s| s.is_bonus)
            .unwrap_or(false)
    }

    /// Count symbol occurrences in grid
    #[inline]
    pub fn count_symbol(&self, grid: &Grid, predicate: impl Fn(u8) -> bool) -> u8 {
        let mut count = 0;
        for reel in 0..5 {
            for row in 0..3 {
                if predicate(grid[reel][row]) {
                    count += 1;
                }
            }
        }
        count
    }

    /// Count scatters in grid
    #[inline]
    pub fn count_scatters(&self, grid: &Grid) -> u8 {
        self.count_symbol(grid, |idx| self.is_scatter(idx))
    }

    /// Count bonus orbs in grid
    #[inline]
    pub fn count_bonus(&self, grid: &Grid) -> u8 {
        self.count_symbol(grid, |idx| self.is_bonus(idx))
    }
}
