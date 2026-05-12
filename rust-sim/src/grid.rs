//! Grid Generation Module
//!
//! Dynamic grid that reads dimensions from `GameConfig` at runtime.
//! No hardcoded `5` or `3` anywhere — all sizing flows from config.
//!
//! `DynGrid` stores symbols as `cells[reel][row]`.  The `Grid` type alias
//! keeps backward compat with the rest of the codebase that uses `Grid`.

use crate::config::GameConfig;
use crate::rng::SlotRng;

// ─── DynGrid ───────────────────────────────────────────────────────────────

/// Dynamic slot grid.  `cells[reel][row]` holds the symbol index (u8).
#[derive(Debug, Clone)]
pub struct DynGrid {
    /// `cells[reel][row]` — inner vec length = rows for that reel.
    pub cells: Vec<Vec<u8>>,
    /// Number of reels.
    pub reels: usize,
    /// Maximum row count (uniform for rectangular topology).
    pub rows: usize,
}

impl DynGrid {
    /// Create a zeroed grid of the given dimensions.
    pub fn new(reels: usize, rows: usize) -> Self {
        DynGrid {
            cells: vec![vec![0u8; rows]; reels],
            reels,
            rows,
        }
    }

    /// Get symbol index at `[reel][row]`.  Returns `0` if out of bounds.
    #[inline]
    pub fn get(&self, reel: usize, row: usize) -> u8 {
        self.cells
            .get(reel)
            .and_then(|r| r.get(row))
            .copied()
            .unwrap_or(0)
    }

    /// Set symbol index at `[reel][row]`.  No-op if out of bounds.
    #[inline]
    pub fn set(&mut self, reel: usize, row: usize, val: u8) {
        if let Some(r) = self.cells.get_mut(reel) {
            if let Some(cell) = r.get_mut(row) {
                *cell = val;
            }
        }
    }

    /// Row count for a specific reel.  For rectangular grids this is
    /// `self.rows`; Faza 2 can override this for variable-row grids.
    #[inline]
    pub fn rows_for_reel(&self, _reel: usize) -> usize {
        self.rows
    }
}

// ─── Type alias ────────────────────────────────────────────────────────────

/// Public type alias kept for backward compatibility.
pub type Grid = DynGrid;

// ─── GridGenerator ─────────────────────────────────────────────────────────

/// Grid generator — reads reel count and row count from config.
pub struct GridGenerator<'a> {
    config: &'a GameConfig,
    /// Precomputed base-game weights per reel: `(symbol_index, weight)`.
    base_weights: Vec<Vec<(u8, u32)>>,
    /// Precomputed free-spins weights per reel.
    fs_weights: Vec<Vec<(u8, u32)>>,
    /// Cumulative totals for base weights.
    base_totals: Vec<u32>,
    /// Cumulative totals for FS weights.
    fs_totals: Vec<u32>,
}

impl<'a> GridGenerator<'a> {
    /// Create a new grid generator.  Precomputes weight tables for O(1)
    /// weighted sampling at spin time.
    pub fn new(config: &'a GameConfig) -> Self {
        let num_reels = config.reels as usize;

        let mut base_weights = Vec::with_capacity(num_reels);
        let mut fs_weights = Vec::with_capacity(num_reels);
        let mut base_totals = Vec::with_capacity(num_reels);
        let mut fs_totals = Vec::with_capacity(num_reels);

        for reel in 0..num_reels {
            // ── Base game weights ──────────────────────────────────────
            let (bw, bt) = build_weight_table(config, reel, false);
            base_weights.push(bw);
            base_totals.push(bt);

            // ── Free spins weights ─────────────────────────────────────
            let (fw, ft) = build_weight_table(config, reel, true);
            fs_weights.push(fw);
            fs_totals.push(ft);
        }

        GridGenerator {
            config,
            base_weights,
            fs_weights,
            base_totals,
            fs_totals,
        }
    }

    /// Generate a base-game grid.
    #[inline]
    pub fn generate_base(&self, rng: &mut SlotRng) -> Grid {
        self.generate_grid(rng, false)
    }

    /// Generate a free-spins grid.
    #[inline]
    pub fn generate_fs(&self, rng: &mut SlotRng) -> Grid {
        self.generate_grid(rng, true)
    }

    /// Generate a Megaways grid: each reel may have a different row count
    /// for this spin. `row_counts.len()` must equal `config.reels`. The
    /// resulting `DynGrid` allocates the *maximum* row count across reels
    /// (uniform `cells[reel].len()`), but only the first
    /// `row_counts[reel]` cells of each reel are populated — the trailing
    /// slots are left at the sentinel `0`. Evaluators must honour the
    /// `row_counts` passed via `EvalMode::Megaways`, not the grid's
    /// implicit `rows`.
    ///
    /// `row_counts_config` is the configurable per-reel min/max envelope
    /// that drives random row selection for callers that prefer to
    /// resolve row counts inside the generator. Pass `None` to use the
    /// rectangular config dimensions.
    pub fn generate_megaways(
        &self,
        rng: &mut SlotRng,
        row_counts_config: &[(usize, usize)],
    ) -> (Grid, Vec<usize>) {
        let num_reels = self.config.reels as usize;

        // Resolve actual per-reel row counts for this spin.
        let mut row_counts: Vec<usize> = Vec::with_capacity(num_reels);
        let max_rows = row_counts_config
            .iter()
            .map(|(_, hi)| *hi)
            .max()
            .unwrap_or(self.config.rows as usize);

        for reel in 0..num_reels {
            let (lo, hi) = row_counts_config
                .get(reel)
                .copied()
                .unwrap_or((self.config.rows as usize, self.config.rows as usize));
            let span = hi - lo + 1;
            let rc = lo + (rng.random() * span as f64) as usize;
            row_counts.push(rc.min(hi));
        }

        let mut grid = DynGrid::new(num_reels, max_rows);

        let weights = &self.base_weights;
        let totals = &self.base_totals;

        for reel in 0..num_reels {
            let reel_weights = &weights[reel];
            let total = totals[reel];
            if total == 0 {
                continue;
            }

            let reel_rows = row_counts[reel];
            for row in 0..reel_rows {
                let mut roll = rng.random() * total as f64;
                let mut chosen = 0u8;
                for &(sym_idx, weight) in reel_weights {
                    roll -= weight as f64;
                    if roll <= 0.0 {
                        chosen = sym_idx;
                        break;
                    }
                }
                grid.set(reel, row, chosen);
            }
        }

        (grid, row_counts)
    }

    /// Core grid generation — iterates over `config.reels` reels and
    /// `config.rows` rows (no hardcoded constants).
    fn generate_grid(&self, rng: &mut SlotRng, is_fs: bool) -> Grid {
        let num_reels = self.config.reels as usize;
        let num_rows = self.config.rows as usize;

        let mut grid = DynGrid::new(num_reels, num_rows);

        let weights = if is_fs {
            &self.fs_weights
        } else {
            &self.base_weights
        };
        let totals = if is_fs {
            &self.fs_totals
        } else {
            &self.base_totals
        };

        for reel in 0..num_reels {
            let reel_weights = &weights[reel];
            let total = totals[reel];

            if total == 0 {
                continue;
            }

            let reel_rows = grid.rows_for_reel(reel);
            for row in 0..reel_rows {
                let mut roll = rng.random() * total as f64;
                let mut chosen = 0u8;

                for &(sym_idx, weight) in reel_weights {
                    roll -= weight as f64;
                    if roll <= 0.0 {
                        chosen = sym_idx;
                        break;
                    }
                }
                grid.set(reel, row, chosen);
            }
        }

        grid
    }

    // ── Symbol helpers ──────────────────────────────────────────────────

    /// Symbol id string for a symbol index.
    #[inline]
    pub fn symbol_id(&self, idx: u8) -> &str {
        self.config
            .symbols
            .get(idx as usize)
            .map(|s| s.id.as_str())
            .unwrap_or("?")
    }

    /// Returns `true` if the symbol at `idx` is a wild.
    #[inline]
    pub fn is_wild(&self, idx: u8) -> bool {
        self.config
            .symbols
            .get(idx as usize)
            .map(|s| s.is_wild)
            .unwrap_or(false)
    }

    /// Returns `true` if the symbol at `idx` is a scatter.
    #[inline]
    pub fn is_scatter(&self, idx: u8) -> bool {
        self.config
            .symbols
            .get(idx as usize)
            .map(|s| s.is_scatter)
            .unwrap_or(false)
    }

    /// Returns `true` if the symbol at `idx` is a bonus.
    #[inline]
    pub fn is_bonus(&self, idx: u8) -> bool {
        self.config
            .symbols
            .get(idx as usize)
            .map(|s| s.is_bonus)
            .unwrap_or(false)
    }

    /// Count cells matching `predicate` across the whole grid.
    #[inline]
    pub fn count_symbol(&self, grid: &Grid, predicate: impl Fn(u8) -> bool) -> u8 {
        let num_reels = self.config.reels as usize;
        let mut count = 0u8;
        for reel in 0..num_reels {
            let reel_rows = grid.rows_for_reel(reel);
            for row in 0..reel_rows {
                if predicate(grid.get(reel, row)) {
                    count += 1;
                }
            }
        }
        count
    }

    /// Count scatter symbols in the grid.
    #[inline]
    pub fn count_scatters(&self, grid: &Grid) -> u8 {
        self.count_symbol(grid, |idx| self.is_scatter(idx))
    }

    /// Count bonus symbols in the grid.
    #[inline]
    pub fn count_bonus(&self, grid: &Grid) -> u8 {
        self.count_symbol(grid, |idx| self.is_bonus(idx))
    }
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/// Build `(weights, total)` for a single reel from config.
fn build_weight_table(config: &GameConfig, reel: usize, is_fs: bool) -> (Vec<(u8, u32)>, u32) {
    let source = if is_fs {
        &config.fs_weights
    } else {
        &config.base_weights
    };

    let mut reel_weights: Vec<(u8, u32)> = Vec::new();
    let mut total = 0u32;

    if let Some(weights) = source.get(reel) {
        for entry in weights {
            if let Some(idx) = config.symbol_index(&entry.symbol) {
                reel_weights.push((idx as u8, entry.weight));
                total += entry.weight;
            }
        }
    }

    (reel_weights, total)
}
