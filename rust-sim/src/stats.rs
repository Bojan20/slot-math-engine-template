//! Statistics Accumulator
//!
//! Thread-safe streaming statistics with overflow-safe integers.
//! Uses i128 internally for high-precision accumulation.

use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;

/// Win distribution buckets (in multiples of bet)
pub const WIN_BUCKETS: &[f64] = &[
    0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 5000.0,
];

/// Atomic statistics accumulator (thread-safe)
#[derive(Default)]
pub struct AtomicStats {
    pub total_spins: AtomicU64,
    pub total_wagered: AtomicI64,
    pub total_won: AtomicI64,
    pub total_base_won: AtomicI64,
    pub total_fs_won: AtomicI64,
    pub total_hnw_won: AtomicI64,
    pub total_lightning_uplift: AtomicI64,

    pub winning_spins: AtomicU64,
    pub fs_triggers: AtomicU64,
    pub hnw_triggers: AtomicU64,
    pub lightning_triggers: AtomicU64,

    pub max_win: AtomicI64,
    pub max_mult_seen: AtomicU64,

    // Feature stats
    pub total_fs_spins: AtomicU64,
    pub total_hnw_respins: AtomicU64,
    pub fs_retriggers: AtomicU64,
    pub hnw_full_grids: AtomicU64,

    // Jackpot counts
    pub jackpots_mini: AtomicU64,
    pub jackpots_minor: AtomicU64,
    pub jackpots_major: AtomicU64,
    pub jackpots_grand: AtomicU64,

    // Win distribution (protected by mutex for complex updates)
    win_distribution: Mutex<WinDistribution>,
}

/// Win distribution histogram
#[derive(Default, Clone)]
pub struct WinDistribution {
    /// Counts per bucket (bucket i = wins in range [WIN_BUCKETS[i], WIN_BUCKETS[i+1]))
    pub buckets: [u64; 14],
    /// Sum of squared wins (for variance calculation)
    pub sum_sq_wins: f64,
    /// Total wins count (for mean calculation)
    pub win_count: u64,
    /// Sum of all wins (for mean)
    pub sum_wins: f64,
}

impl WinDistribution {
    pub fn record(&mut self, win_mult: f64) {
        if win_mult > 0.0 {
            self.win_count += 1;
            self.sum_wins += win_mult;
            self.sum_sq_wins += win_mult * win_mult;

            // Find bucket
            for (i, &threshold) in WIN_BUCKETS.iter().enumerate() {
                if i + 1 >= WIN_BUCKETS.len() || win_mult < WIN_BUCKETS[i + 1] {
                    self.buckets[i] += 1;
                    break;
                }
            }
        }
    }

    pub fn merge(&mut self, other: &WinDistribution) {
        for i in 0..self.buckets.len() {
            self.buckets[i] += other.buckets[i];
        }
        self.sum_sq_wins += other.sum_sq_wins;
        self.win_count += other.win_count;
        self.sum_wins += other.sum_wins;
    }

    /// Calculate volatility index (coefficient of variation of wins)
    pub fn volatility_index(&self) -> f64 {
        if self.win_count < 2 {
            return 0.0;
        }
        let mean = self.sum_wins / self.win_count as f64;
        let variance = (self.sum_sq_wins - self.sum_wins * mean) / (self.win_count - 1) as f64;
        if mean > 0.0 {
            variance.sqrt() / mean
        } else {
            0.0
        }
    }
}

impl AtomicStats {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a win to the distribution
    pub fn record_win(&self, win_mult: f64) {
        if let Ok(mut dist) = self.win_distribution.lock() {
            dist.record(win_mult);
        }
    }

    /// Get win distribution snapshot
    pub fn get_distribution(&self) -> WinDistribution {
        self.win_distribution.lock().map(|d| d.clone()).unwrap_or_default()
    }

    /// Merge another stats into this one
    pub fn merge(&self, other: &AtomicStats) {
        self.total_spins.fetch_add(other.total_spins.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_wagered.fetch_add(other.total_wagered.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_won.fetch_add(other.total_won.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_base_won.fetch_add(other.total_base_won.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_fs_won.fetch_add(other.total_fs_won.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_hnw_won.fetch_add(other.total_hnw_won.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_lightning_uplift.fetch_add(other.total_lightning_uplift.load(Ordering::Relaxed), Ordering::Relaxed);

        self.winning_spins.fetch_add(other.winning_spins.load(Ordering::Relaxed), Ordering::Relaxed);
        self.fs_triggers.fetch_add(other.fs_triggers.load(Ordering::Relaxed), Ordering::Relaxed);
        self.hnw_triggers.fetch_add(other.hnw_triggers.load(Ordering::Relaxed), Ordering::Relaxed);
        self.lightning_triggers.fetch_add(other.lightning_triggers.load(Ordering::Relaxed), Ordering::Relaxed);

        // Max values
        let other_max = other.max_win.load(Ordering::Relaxed);
        loop {
            let current = self.max_win.load(Ordering::Relaxed);
            if other_max <= current {
                break;
            }
            if self.max_win.compare_exchange(current, other_max, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
                break;
            }
        }

        let other_mult = other.max_mult_seen.load(Ordering::Relaxed);
        loop {
            let current = self.max_mult_seen.load(Ordering::Relaxed);
            if other_mult <= current {
                break;
            }
            if self.max_mult_seen.compare_exchange(current, other_mult, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
                break;
            }
        }

        self.total_fs_spins.fetch_add(other.total_fs_spins.load(Ordering::Relaxed), Ordering::Relaxed);
        self.total_hnw_respins.fetch_add(other.total_hnw_respins.load(Ordering::Relaxed), Ordering::Relaxed);
        self.fs_retriggers.fetch_add(other.fs_retriggers.load(Ordering::Relaxed), Ordering::Relaxed);
        self.hnw_full_grids.fetch_add(other.hnw_full_grids.load(Ordering::Relaxed), Ordering::Relaxed);

        self.jackpots_mini.fetch_add(other.jackpots_mini.load(Ordering::Relaxed), Ordering::Relaxed);
        self.jackpots_minor.fetch_add(other.jackpots_minor.load(Ordering::Relaxed), Ordering::Relaxed);
        self.jackpots_major.fetch_add(other.jackpots_major.load(Ordering::Relaxed), Ordering::Relaxed);
        self.jackpots_grand.fetch_add(other.jackpots_grand.load(Ordering::Relaxed), Ordering::Relaxed);

        // Merge win distribution
        if let (Ok(mut self_dist), Ok(other_dist)) = (self.win_distribution.lock(), other.win_distribution.lock()) {
            self_dist.merge(&other_dist);
        }
    }

    /// Get RTP as percentage
    pub fn rtp(&self) -> f64 {
        let wagered = self.total_wagered.load(Ordering::Relaxed);
        let won = self.total_won.load(Ordering::Relaxed);
        if wagered == 0 {
            0.0
        } else {
            (won as f64 / wagered as f64) * 100.0
        }
    }

    /// Get hit rate as percentage
    pub fn hit_rate(&self) -> f64 {
        let spins = self.total_spins.load(Ordering::Relaxed);
        let wins = self.winning_spins.load(Ordering::Relaxed);
        if spins == 0 {
            0.0
        } else {
            (wins as f64 / spins as f64) * 100.0
        }
    }

    /// Get FS frequency (1 in X spins)
    pub fn fs_frequency(&self) -> f64 {
        let spins = self.total_spins.load(Ordering::Relaxed);
        let triggers = self.fs_triggers.load(Ordering::Relaxed);
        if triggers == 0 {
            0.0
        } else {
            spins as f64 / triggers as f64
        }
    }

    /// Get HNW frequency (1 in X spins)
    pub fn hnw_frequency(&self) -> f64 {
        let spins = self.total_spins.load(Ordering::Relaxed);
        let triggers = self.hnw_triggers.load(Ordering::Relaxed);
        if triggers == 0 {
            0.0
        } else {
            spins as f64 / triggers as f64
        }
    }

    /// Get volatility index
    pub fn volatility_index(&self) -> f64 {
        self.get_distribution().volatility_index()
    }
}

/// Per-seed statistics (non-atomic, for single-threaded use)
#[derive(Debug, Clone, Default)]
pub struct SeedStats {
    pub spins: u64,
    pub wagered: i64,
    pub won: i64,
    pub rtp: f64,
}

/// Multi-seed aggregator with detailed statistics
#[derive(Debug, Default)]
pub struct MultiSeedStats {
    pub seeds: Vec<SeedStats>,
    pub mean_rtp: f64,
    pub std_dev: f64,
    pub std_error: f64,
    pub ci_95_low: f64,
    pub ci_95_high: f64,
}

impl MultiSeedStats {
    pub fn from_seeds(seeds: Vec<SeedStats>) -> Self {
        if seeds.is_empty() {
            return Self::default();
        }

        let n = seeds.len() as f64;
        let mean = seeds.iter().map(|s| s.rtp).sum::<f64>() / n;

        let variance = seeds.iter()
            .map(|s| (s.rtp - mean).powi(2))
            .sum::<f64>() / (n - 1.0).max(1.0);

        let std_dev = variance.sqrt();
        let std_error = std_dev / n.sqrt();
        let ci_95 = 1.96 * std_error;

        MultiSeedStats {
            seeds,
            mean_rtp: mean,
            std_dev,
            std_error,
            ci_95_low: mean - ci_95,
            ci_95_high: mean + ci_95,
        }
    }
}

/// PAR Sheet metrics
#[derive(Debug, Clone, Default)]
pub struct PARMetrics {
    pub total_rtp: f64,
    pub base_rtp: f64,
    pub fs_rtp: f64,
    pub hnw_rtp: f64,
    pub lightning_rtp: f64,

    pub hit_rate: f64,
    pub fs_frequency: f64,
    pub hnw_frequency: f64,

    pub avg_fs_win: f64,
    pub avg_hnw_win: f64,
    pub avg_fs_spins: f64,
    pub avg_hnw_orbs: f64,

    pub max_win: f64,
    pub volatility_index: f64,

    pub ci_95_low: f64,
    pub ci_95_high: f64,
    pub std_error: f64,
}

impl PARMetrics {
    pub fn from_stats(stats: &AtomicStats, multi_seed: &MultiSeedStats, total_bet_mc: i64) -> Self {
        let total_wagered = stats.total_wagered.load(Ordering::Relaxed) as f64;
        let to_pct = |v: i64| (v as f64 / total_wagered) * 100.0;

        let fs_triggers = stats.fs_triggers.load(Ordering::Relaxed);
        let hnw_triggers = stats.hnw_triggers.load(Ordering::Relaxed);
        let fs_won = stats.total_fs_won.load(Ordering::Relaxed);
        let hnw_won = stats.total_hnw_won.load(Ordering::Relaxed);

        PARMetrics {
            total_rtp: stats.rtp(),
            base_rtp: to_pct(stats.total_base_won.load(Ordering::Relaxed)),
            fs_rtp: to_pct(fs_won),
            hnw_rtp: to_pct(hnw_won),
            lightning_rtp: to_pct(stats.total_lightning_uplift.load(Ordering::Relaxed)),

            hit_rate: stats.hit_rate(),
            fs_frequency: stats.fs_frequency(),
            hnw_frequency: stats.hnw_frequency(),

            avg_fs_win: if fs_triggers > 0 {
                (fs_won as f64 / fs_triggers as f64) / total_bet_mc as f64
            } else { 0.0 },
            avg_hnw_win: if hnw_triggers > 0 {
                (hnw_won as f64 / hnw_triggers as f64) / total_bet_mc as f64
            } else { 0.0 },
            avg_fs_spins: if fs_triggers > 0 {
                stats.total_fs_spins.load(Ordering::Relaxed) as f64 / fs_triggers as f64
            } else { 0.0 },
            avg_hnw_orbs: 0.0, // Would need tracking

            max_win: stats.max_win.load(Ordering::Relaxed) as f64 / total_bet_mc as f64,
            volatility_index: stats.volatility_index(),

            ci_95_low: multi_seed.ci_95_low,
            ci_95_high: multi_seed.ci_95_high,
            std_error: multi_seed.std_error,
        }
    }
}
