// RNG — PCG64 wrapper with deterministic seeding.
//
// We deliberately use a non-cryptographic generator: certification only
// requires reproducibility + uniformity. PCG64 passes BigCrush and
// streams ~10 ns/draw on M-series, which keeps a 100M-spin MC under a
// minute single-threaded.

use rand::{Rng, SeedableRng};
use rand_pcg::Pcg64;

#[derive(Debug, Clone)]
pub struct Prng(pub Pcg64);

impl Prng {
    pub fn from_seed(seed: u64) -> Self {
        // Pcg64::seed_from_u64 hashes through SplitMix64 internally.
        Prng(Pcg64::seed_from_u64(seed))
    }

    /// Uniform integer in [0, n).
    #[inline]
    pub fn gen_range_u64(&mut self, n: u64) -> u64 {
        self.0.gen_range(0..n)
    }

    /// Uniform integer in [0, n) for i64 weights.
    #[inline]
    pub fn gen_range_i64(&mut self, n: i64) -> i64 {
        debug_assert!(n > 0, "weight total must be positive, got {n}");
        self.0.gen_range(0..n)
    }

    /// 32-bit uniform draw (matches Excel CE RNG range 0..=2^32-1).
    #[inline]
    pub fn gen_u32(&mut self) -> u32 {
        self.0.gen()
    }

    /// Uniform double in [0, 1) — used by GRAND probability gate.
    #[inline]
    pub fn gen_f64(&mut self) -> f64 {
        self.0.gen()
    }
}
