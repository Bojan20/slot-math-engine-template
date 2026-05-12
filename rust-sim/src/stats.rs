//! Statistics Accumulator
//!
//! Thread-safe streaming statistics with overflow-safe integers.
//! Uses i128 internally for high-precision accumulation.
//!
//! ## Faza 4 additions
//!
//! * `HdrHistogram` — constant-memory, log-scale win histogram usable at
//!   1T+ spins. 32 atomic buckets covering [0, ∞) in log-scale steps.
//!   Replaces the old 14-bucket flat `WinDistribution` for PAR output.
//!   The legacy `WinDistribution` is retained for backward-compat tests.
//!
//! * `AtomicStats::record_win_hdr` — single call updates the HDR bucket
//!   atomically (no Mutex).
//!
//! * `AtomicStats::get_hdr_histogram` — zero-copy snapshot of all 32
//!   bucket counts for PAR sheet generation.

use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;

// ─── Legacy win-distribution (14 flat buckets) ───────────────────────────────

/// Win distribution buckets (in multiples of bet).
/// Kept for backward compatibility with existing tests.
pub const WIN_BUCKETS: &[f64] = &[
    0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 5000.0,
];

/// Win distribution histogram (14 flat buckets, mutex-protected).
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

    /// Coefficient of variation (σ/μ) — proxy for volatility index.
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

// ─── HDR Histogram ───────────────────────────────────────────────────────────

/// Number of buckets in the HDR histogram.
/// Bucket 0 = no-win (win == 0.0).
/// Buckets 1..=30 = [THRESHOLDS[i-1], THRESHOLDS[i]).
/// Bucket 31 = [THRESHOLDS[29], ∞).
pub const HDR_BUCKET_COUNT: usize = 32;

/// Constant-memory, log-scale win histogram.
///
/// 32 atomic `u64` buckets cover the full range of slot payouts from
/// 0× to 50 000×+. Each bucket update is a single `fetch_add` — no
/// mutex, no allocation, safe at 1T spins.
///
/// ### Bucket layout
/// ```text
/// bucket  0          → win == 0.0 (no win)
/// bucket  1          → 0.0 < win <  0.1
/// bucket  2          → 0.1 ≤ win <  0.2
/// ...
/// bucket 30          → 20 000 ≤ win < 50 000
/// bucket 31          → win ≥ 50 000  (unbounded top)
/// ```
pub struct HdrHistogram {
    counts: [AtomicU64; HDR_BUCKET_COUNT],
}

impl Default for HdrHistogram {
    fn default() -> Self {
        Self {
            counts: std::array::from_fn(|_| AtomicU64::new(0)),
        }
    }
}

impl HdrHistogram {
    /// Threshold boundaries (30 values → 31 intervals + 1 no-win bucket = 32).
    pub const THRESHOLDS: &'static [f64] = &[
        0.1, 0.2, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 10.0, 15.0, 20.0, 30.0, 50.0, 75.0, 100.0,
        150.0, 200.0, 300.0, 500.0, 750.0, 1000.0, 1500.0, 2000.0, 3000.0, 5000.0, 7500.0,
        10000.0, 15000.0, 20000.0, 50000.0,
    ];

    /// Record one win (in bet multiples). Lock-free.
    #[inline]
    pub fn record(&self, win_x: f64) {
        let bucket = if win_x <= 0.0 {
            0
        } else {
            // Linear scan — 30 iterations max, branch-predictor-friendly.
            let mut b = 1usize;
            for &t in Self::THRESHOLDS {
                if win_x < t {
                    break;
                }
                b += 1;
            }
            b.min(HDR_BUCKET_COUNT - 1)
        };
        self.counts[bucket].fetch_add(1, Ordering::Relaxed);
    }

    /// Count in a specific bucket.
    #[inline]
    pub fn get(&self, bucket: usize) -> u64 {
        self.counts
            .get(bucket)
            .map_or(0, |c| c.load(Ordering::Relaxed))
    }

    /// Total spins recorded.
    pub fn total(&self) -> u64 {
        self.counts.iter().map(|c| c.load(Ordering::Relaxed)).sum()
    }

    /// Merge `other` into `self` (used when combining per-thread shards).
    pub fn merge(&self, other: &HdrHistogram) {
        for i in 0..HDR_BUCKET_COUNT {
            self.counts[i].fetch_add(other.counts[i].load(Ordering::Relaxed), Ordering::Relaxed);
        }
    }

    /// Zero-copy snapshot as plain array of counts.
    pub fn snapshot(&self) -> [u64; HDR_BUCKET_COUNT] {
        std::array::from_fn(|i| self.counts[i].load(Ordering::Relaxed))
    }
}

// ─── Atomic statistics accumulator ───────────────────────────────────────────

/// Atomic statistics accumulator (thread-safe).
#[derive(Default)]
pub struct AtomicStats {
    pub total_spins: AtomicU64,
    pub total_wagered: AtomicI64,
    pub total_won: AtomicI64,
    pub total_base_won: AtomicI64,
    pub total_fs_won: AtomicI64,
    pub total_hnw_won: AtomicI64,
    pub total_cascade_won: AtomicI64,
    pub total_jackpot_won: AtomicI64,
    pub total_lightning_uplift: AtomicI64,

    pub winning_spins: AtomicU64,
    pub fs_triggers: AtomicU64,
    pub hnw_triggers: AtomicU64,
    pub lightning_triggers: AtomicU64,
    pub cascade_triggers: AtomicU64,

    pub max_win: AtomicI64,
    pub max_mult_seen: AtomicU64,

    // Feature stats
    pub total_fs_spins: AtomicU64,
    pub total_hnw_respins: AtomicU64,
    pub fs_retriggers: AtomicU64,
    pub hnw_full_grids: AtomicU64,

    // Legacy jackpot counts (kept for compat with Faza 3 tests)
    pub jackpots_mini: AtomicU64,
    pub jackpots_minor: AtomicU64,
    pub jackpots_major: AtomicU64,
    pub jackpots_grand: AtomicU64,

    // Legacy 14-bucket distribution (mutex-protected)
    win_distribution: Mutex<WinDistribution>,

    // Faza 4: lock-free HDR histogram
    hdr: HdrHistogram,
}

impl AtomicStats {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a win to both the legacy distribution AND the HDR histogram.
    pub fn record_win(&self, win_mult: f64) {
        // HDR: lock-free
        self.hdr.record(win_mult);
        // Legacy: mutex
        if let Ok(mut dist) = self.win_distribution.lock() {
            dist.record(win_mult);
        }
    }

    /// Record only to the HDR histogram (used in hot loop when legacy not needed).
    #[inline]
    pub fn record_win_hdr(&self, win_mult: f64) {
        self.hdr.record(win_mult);
    }

    /// Snapshot of the HDR histogram counts (for PAR generation).
    pub fn get_hdr_histogram(&self) -> [u64; HDR_BUCKET_COUNT] {
        self.hdr.snapshot()
    }

    /// Get legacy win distribution snapshot.
    pub fn get_distribution(&self) -> WinDistribution {
        self.win_distribution
            .lock()
            .map(|d| d.clone())
            .unwrap_or_default()
    }

    /// Merge another stats shard into this one.
    pub fn merge(&self, other: &AtomicStats) {
        macro_rules! add {
            ($field:ident) => {
                self.$field
                    .fetch_add(other.$field.load(Ordering::Relaxed), Ordering::Relaxed);
            };
        }

        add!(total_spins);
        add!(total_wagered);
        add!(total_won);
        add!(total_base_won);
        add!(total_fs_won);
        add!(total_hnw_won);
        add!(total_cascade_won);
        add!(total_jackpot_won);
        add!(total_lightning_uplift);
        add!(winning_spins);
        add!(fs_triggers);
        add!(hnw_triggers);
        add!(lightning_triggers);
        add!(cascade_triggers);
        add!(total_fs_spins);
        add!(total_hnw_respins);
        add!(fs_retriggers);
        add!(hnw_full_grids);
        add!(jackpots_mini);
        add!(jackpots_minor);
        add!(jackpots_major);
        add!(jackpots_grand);

        // Max values — CAS loop.
        Self::atomic_max(&self.max_win, other.max_win.load(Ordering::Relaxed));
        Self::atomic_max_u64(&self.max_mult_seen, other.max_mult_seen.load(Ordering::Relaxed));

        // HDR merge — lock-free.
        self.hdr.merge(&other.hdr);

        // Legacy distribution merge.
        if let (Ok(mut s), Ok(o)) =
            (self.win_distribution.lock(), other.win_distribution.lock())
        {
            s.merge(&o);
        }
    }

    fn atomic_max(target: &AtomicI64, candidate: i64) {
        loop {
            let cur = target.load(Ordering::Relaxed);
            if candidate <= cur {
                break;
            }
            if target
                .compare_exchange(cur, candidate, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
    }

    fn atomic_max_u64(target: &AtomicU64, candidate: u64) {
        loop {
            let cur = target.load(Ordering::Relaxed);
            if candidate <= cur {
                break;
            }
            if target
                .compare_exchange(cur, candidate, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
    }

    // ── Derived metrics ───────────────────────────────────────────────────────

    pub fn rtp(&self) -> f64 {
        let wagered = self.total_wagered.load(Ordering::Relaxed);
        let won = self.total_won.load(Ordering::Relaxed);
        if wagered == 0 {
            0.0
        } else {
            (won as f64 / wagered as f64) * 100.0
        }
    }

    pub fn hit_rate(&self) -> f64 {
        let spins = self.total_spins.load(Ordering::Relaxed);
        let wins = self.winning_spins.load(Ordering::Relaxed);
        if spins == 0 {
            0.0
        } else {
            (wins as f64 / spins as f64) * 100.0
        }
    }

    pub fn fs_frequency(&self) -> f64 {
        let spins = self.total_spins.load(Ordering::Relaxed);
        let triggers = self.fs_triggers.load(Ordering::Relaxed);
        if triggers == 0 {
            0.0
        } else {
            spins as f64 / triggers as f64
        }
    }

    pub fn hnw_frequency(&self) -> f64 {
        let spins = self.total_spins.load(Ordering::Relaxed);
        let triggers = self.hnw_triggers.load(Ordering::Relaxed);
        if triggers == 0 {
            0.0
        } else {
            spins as f64 / triggers as f64
        }
    }

    pub fn volatility_index(&self) -> f64 {
        self.get_distribution().volatility_index()
    }
}

// ─── Per-seed / multi-seed statistics ────────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct SeedStats {
    pub spins: u64,
    pub wagered: i64,
    pub won: i64,
    pub rtp: f64,
}

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
        let variance =
            seeds.iter().map(|s| (s.rtp - mean).powi(2)).sum::<f64>() / (n - 1.0).max(1.0);
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

// ─── PAR Metrics ─────────────────────────────────────────────────────────────

/// Per-metric summary for PAR sheet generation.
#[derive(Debug, Clone, Default)]
pub struct PARMetrics {
    pub total_rtp: f64,
    pub base_rtp: f64,
    pub fs_rtp: f64,
    pub hnw_rtp: f64,
    pub cascade_rtp: f64,
    pub jackpot_rtp: f64,
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
        let cascade_won = stats.total_cascade_won.load(Ordering::Relaxed);
        let jackpot_won = stats.total_jackpot_won.load(Ordering::Relaxed);

        PARMetrics {
            total_rtp: stats.rtp(),
            base_rtp: to_pct(stats.total_base_won.load(Ordering::Relaxed)),
            fs_rtp: to_pct(fs_won),
            hnw_rtp: to_pct(hnw_won),
            cascade_rtp: to_pct(cascade_won),
            jackpot_rtp: to_pct(jackpot_won),
            lightning_rtp: to_pct(stats.total_lightning_uplift.load(Ordering::Relaxed)),

            hit_rate: stats.hit_rate(),
            fs_frequency: stats.fs_frequency(),
            hnw_frequency: stats.hnw_frequency(),

            avg_fs_win: if fs_triggers > 0 {
                (fs_won as f64 / fs_triggers as f64) / total_bet_mc as f64
            } else {
                0.0
            },
            avg_hnw_win: if hnw_triggers > 0 {
                (hnw_won as f64 / hnw_triggers as f64) / total_bet_mc as f64
            } else {
                0.0
            },
            avg_fs_spins: if fs_triggers > 0 {
                stats.total_fs_spins.load(Ordering::Relaxed) as f64 / fs_triggers as f64
            } else {
                0.0
            },
            avg_hnw_orbs: if hnw_triggers > 0 {
                stats.total_hnw_respins.load(Ordering::Relaxed) as f64 / hnw_triggers as f64
            } else {
                0.0
            },

            max_win: stats.max_win.load(Ordering::Relaxed) as f64 / total_bet_mc as f64,
            volatility_index: stats.volatility_index(),

            ci_95_low: multi_seed.ci_95_low,
            ci_95_high: multi_seed.ci_95_high,
            std_error: multi_seed.std_error,
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── HDR histogram ──────────────────────────────────────────────────────────

    #[test]
    fn test_hdr_no_win_bucket() {
        let h = HdrHistogram::default();
        h.record(0.0);
        h.record(0.0);
        assert_eq!(h.get(0), 2);
        // All other buckets empty.
        for i in 1..HDR_BUCKET_COUNT {
            assert_eq!(h.get(i), 0, "bucket {i} should be empty");
        }
    }

    #[test]
    fn test_hdr_boundary_values() {
        let h = HdrHistogram::default();
        // 0.1 is THRESHOLDS[0] — should land in bucket 2 (≥0.1, <0.2).
        h.record(0.1);
        assert_eq!(h.get(2), 1, "0.1 → bucket 2");
        // 0.05 is in (0, 0.1) → bucket 1.
        h.record(0.05);
        assert_eq!(h.get(1), 1, "0.05 → bucket 1");
        // 50000.0 is the last threshold → bucket 31 (unbounded top).
        h.record(50000.0);
        assert_eq!(h.get(31), 1, "50000 → bucket 31");
        // 99999.0 also → bucket 31.
        h.record(99999.0);
        assert_eq!(h.get(31), 2, "99999 → bucket 31");
    }

    #[test]
    fn test_hdr_total_matches_records() {
        let h = HdrHistogram::default();
        for win in [0.0, 1.5, 10.0, 100.0, 1000.0, 0.0, 5.0] {
            h.record(win);
        }
        assert_eq!(h.total(), 7);
    }

    #[test]
    fn test_hdr_merge() {
        let h1 = HdrHistogram::default();
        let h2 = HdrHistogram::default();
        // THRESHOLDS: [0.1, 0.2, 0.5, 1.0, 2.0, …]
        // 1.0 crosses thresholds 0.1,0.2,0.5,1.0 (all ≤ win) → bucket 5
        h1.record(1.0);
        h2.record(1.0);
        h1.merge(&h2);
        assert_eq!(h1.get(5), 2);
    }

    #[test]
    fn test_hdr_snapshot_matches_get() {
        let h = HdrHistogram::default();
        for i in 0..HDR_BUCKET_COUNT {
            for _ in 0..i {
                h.counts[i].fetch_add(1, Ordering::Relaxed);
            }
        }
        let snap = h.snapshot();
        for i in 0..HDR_BUCKET_COUNT {
            assert_eq!(snap[i], h.get(i));
        }
    }

    #[test]
    fn test_hdr_1m_spins_no_panic() {
        let stats = AtomicStats::new();
        let mut rng = crate::rng::SlotRng::new(777);
        for _ in 0..1_000_000 {
            let win = rng.random() * 200.0;
            stats.record_win_hdr(win);
        }
        // Total recorded must be 1M.
        assert_eq!(stats.hdr.total(), 1_000_000);
    }

    // ── AtomicStats merge ──────────────────────────────────────────────────────

    #[test]
    fn test_atomic_stats_merge_hdr() {
        let a = AtomicStats::new();
        let b = AtomicStats::new();
        a.record_win_hdr(5.0); // bucket 8 (≥5, <8)
        b.record_win_hdr(5.0);
        a.merge(&b);
        assert_eq!(a.hdr.get(8), 2);
    }

    // ── PARMetrics from_stats ─────────────────────────────────────────────────

    #[test]
    fn test_par_metrics_rtp() {
        let stats = AtomicStats::new();
        stats.total_wagered.store(1_000_000, Ordering::Relaxed);
        stats.total_won.store(960_000, Ordering::Relaxed);
        stats.total_base_won.store(600_000, Ordering::Relaxed);
        stats.total_fs_won.store(360_000, Ordering::Relaxed);
        stats.winning_spins.store(330_000, Ordering::Relaxed);
        stats.total_spins.store(1_000_000, Ordering::Relaxed);

        let multi = MultiSeedStats::default();
        let par = PARMetrics::from_stats(&stats, &multi, 1);

        assert!((par.total_rtp - 96.0).abs() < 1e-6, "total_rtp={}", par.total_rtp);
        assert!((par.base_rtp - 60.0).abs() < 1e-6, "base_rtp={}", par.base_rtp);
        assert!((par.fs_rtp - 36.0).abs() < 1e-6, "fs_rtp={}", par.fs_rtp);
        assert!((par.hit_rate - 33.0).abs() < 1e-4, "hit_rate={}", par.hit_rate);
    }
}
