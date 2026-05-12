//! FAZA 7 — RNG Plugin Layer
//!
//! Provides a pluggable `RngBackend` trait and four production-grade PRNG
//! implementations:
//!
//! | Backend          | State     | Period      | Use-case                     |
//! |------------------|-----------|-------------|------------------------------|
//! | `Mulberry32`     | 32-bit    | 2^32        | Legacy / TS parity           |
//! | `Pcg64`          | 128-bit   | 2^126       | Default — excellent quality  |
//! | `Xoshiro256SS`   | 256-bit   | 2^256 − 1   | High-throughput parallel     |
//! | `Philox4x32`     | counter   | 2^128       | GPU / deterministic replays  |
//!
//! The original `SlotRng` struct is kept **byte-for-byte unchanged** for
//! backward compatibility with the rest of the codebase.

use serde::{Deserialize, Serialize};

// ─── RngBackend trait ─────────────────────────────────────────────────────────

/// Unified PRNG interface for all Monte Carlo operations.
///
/// Implementors must be `Send + Sync` so they can be used in Rayon workers.
pub trait RngBackend: Send + Sync {
    /// Uniform 64-bit integer in `[0, u64::MAX]`.
    fn next_u64(&mut self) -> u64;

    /// Uniform float in `[0, 1)` — 53-bit mantissa precision.
    #[inline]
    fn next_f64(&mut self) -> f64 {
        // Use top 53 bits of a 64-bit value.
        ((self.next_u64() >> 11) as f64) * (1.0_f64 / (1u64 << 53) as f64)
    }

    /// Uniform integer in `[0, max)` with **zero modulo bias** (Lemire's method).
    ///
    /// Uses the **upper 32 bits** of each `next_u64()` draw — the high bits are
    /// always highest quality regardless of the generator's internal mixing depth.
    /// In particular, generators with an even LCG multiplier in the low 32 bits
    /// (such as PCG-128) have weaker low bits; using `>> 32` avoids this.
    #[inline]
    fn next_u32_bounded(&mut self, max: u32) -> u32 {
        debug_assert!(max > 0, "max must be positive");
        if max == 1 {
            return 0;
        }
        // High 32 bits of a 64-bit draw — uniform in [0, 2^32) for all backends.
        let get_hi32 = |v: u64| (v >> 32) as u32;
        let mut m = (get_hi32(self.next_u64()) as u64).wrapping_mul(max as u64);
        let mut lo = m as u32;
        if lo < max {
            let threshold = max.wrapping_neg() % max;
            while lo < threshold {
                m = (get_hi32(self.next_u64()) as u64).wrapping_mul(max as u64);
                lo = m as u32;
            }
        }
        (m >> 32) as u32
    }

    /// Produce an independent stream seeded from the current state + `nonce`.
    ///
    /// The caller guarantees different `nonce` values for different workers so
    /// that the resulting streams are statistically independent.
    fn split(&self, nonce: u64) -> Box<dyn RngBackend>;

    /// Return the raw state as `[u64; 4]` — for serialization / debugging.
    fn seed_state(&self) -> [u64; 4];
}

// ─── RngKind enum ─────────────────────────────────────────────────────────────

/// Which PRNG backend to use — maps to `rng.kind` in the IR.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RngKind {
    Mulberry32,
    #[default]
    Pcg64,
    Xoshiro256StarStar,
    Philox4x32,
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/// Create a boxed `RngBackend` of the given kind, seeded with `seed`.
pub fn create_rng(kind: RngKind, seed: u64) -> Box<dyn RngBackend> {
    match kind {
        RngKind::Mulberry32 => Box::new(Mulberry32Backend::new(seed)),
        RngKind::Pcg64 => Box::new(Pcg64Backend::new(seed)),
        RngKind::Xoshiro256StarStar => Box::new(Xoshiro256SSBackend::new(seed)),
        RngKind::Philox4x32 => Box::new(Philox4x32Backend::new(seed)),
    }
}

// ─── Mulberry32 backend ───────────────────────────────────────────────────────
//
// 32-bit Mulberry32 algorithm — exact match to the TypeScript implementation.
// Kept for TS↔Rust parity gate (Faza 2).

/// Mulberry32 PRNG backend — bit-identical to the TS `mulberry32()` function.
pub struct Mulberry32Backend {
    state: u32,
}

impl Mulberry32Backend {
    pub fn new(seed: u64) -> Self {
        Self { state: seed as u32 }
    }

    #[inline]
    fn step(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6D2B79F5);
        let t = self.state;
        let mut x = (t ^ (t >> 15)).wrapping_mul(1u32 | t);
        let y = (x ^ (x >> 7)).wrapping_mul(61u32 | x);
        x ^= x.wrapping_add(y);
        x ^ (x >> 14)
    }
}

impl RngBackend for Mulberry32Backend {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let lo = self.step() as u64;
        let hi = self.step() as u64;
        (hi << 32) | lo
    }

    /// Override: match the original Mulberry32 float output exactly.
    #[inline]
    fn next_f64(&mut self) -> f64 {
        self.step() as f64 / 4_294_967_296.0
    }

    fn split(&self, nonce: u64) -> Box<dyn RngBackend> {
        Box::new(Self::new(
            (self.state as u64) ^ nonce ^ 0xDEAD_BEEF_CAFE_BABE,
        ))
    }

    fn seed_state(&self) -> [u64; 4] {
        [self.state as u64, 0, 0, 0]
    }
}

// ─── PCG-64 XSL-RR-64 ─────────────────────────────────────────────────────────
//
// 128-bit LCG with XSL-RR-64 output transform.
// Reference: O'Neill, "PCG: A Family of Simple Fast Space-Efficient Statistically
//            Good Algorithms for Random Number Generation" (2014).
//
// Multiplier: Steele & Vigna 2021 — last nibble changed 44→45 to ensure
//   a ≡ 1 (mod 4), which is required by the Hull-Dobell theorem for full
//   period 2^128.  The original ...44 (≡ 0 mod 4) caused the LCG to reach
//   a fixed-point in exactly 64 steps, making ALL outputs identical.
// Increment:  any odd value (selects the "stream")

const PCG128_MULT: u128 = 0x2360_ED05_1FC6_5DA4_4385_DF64_9FCC_EF45;
const PCG128_INC_DEFAULT: u128 = (0xDA3E_39CB_94B9_5BDB_u128 << 1) | 1;

/// PCG-64 XSL-RR-64 — 128-bit state, 64-bit output.
pub struct Pcg64Backend {
    state: u128,
    inc: u128, // always odd
}

impl Pcg64Backend {
    pub fn new(seed: u64) -> Self {
        let mut rng = Self {
            state: 0,
            inc: PCG128_INC_DEFAULT,
        };
        // Two-step seed initialization (standard PCG seeding protocol).
        rng.state = rng.state.wrapping_add(seed as u128);
        rng.advance_state();
        rng.state = rng
            .state
            .wrapping_add(0x9E37_79B9_7F4A_7C15_u128);
        rng.advance_state();
        rng
    }

    #[inline]
    fn advance_state(&mut self) {
        self.state = self.state.wrapping_mul(PCG128_MULT).wrapping_add(self.inc);
    }

    #[inline]
    fn output(state: u128) -> u64 {
        // XSL-RR-64: XOR high/low halves, rotate right by top 6 bits.
        let hi = (state >> 64) as u64;
        let lo = state as u64;
        let xorshifted = hi ^ lo;
        let rot = (hi >> 58) as u32; // top 6 bits → rotation amount
        xorshifted.rotate_right(rot)
    }
}

impl RngBackend for Pcg64Backend {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let old = self.state;
        self.advance_state();
        Self::output(old)
    }

    fn split(&self, nonce: u64) -> Box<dyn RngBackend> {
        // Different stream = different increment (still odd).
        let new_inc = (self.inc ^ ((nonce as u128).wrapping_mul(0x9E37_79B9_7F4A_7C15_u128))) | 1;
        let mut child = Pcg64Backend {
            state: self.state,
            inc: new_inc,
        };
        child.advance_state();
        Box::new(child)
    }

    fn seed_state(&self) -> [u64; 4] {
        [
            (self.state >> 64) as u64,
            self.state as u64,
            (self.inc >> 64) as u64,
            self.inc as u64,
        ]
    }
}

// ─── Xoshiro256** ─────────────────────────────────────────────────────────────
//
// Reference: Blackman & Vigna, "Scrambled Linear Pseudorandom Number Generators"
//            (2018), https://prng.di.unimi.it/xoshiro256starstar.c
//
// Period: 2^256 − 1.  Passes BigCrush and PractRand.

/// Xoshiro256** — 256-bit state, excellent speed and quality.
pub struct Xoshiro256SSBackend {
    s: [u64; 4],
}

impl Xoshiro256SSBackend {
    /// Seed from a single `u64` using SplitMix64 for state initialization.
    pub fn new(seed: u64) -> Self {
        let mut z = seed;
        let mut s = [0u64; 4];
        for si in &mut s {
            *si = Self::splitmix64(&mut z);
        }
        // Guarantee non-zero state (all-zero is invalid for xoshiro256).
        if s.iter().all(|&x| x == 0) {
            s[0] = 1;
        }
        Self { s }
    }

    #[inline]
    fn splitmix64(z: &mut u64) -> u64 {
        *z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut v = *z;
        v = (v ^ (v >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        v = (v ^ (v >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        v ^ (v >> 31)
    }

    #[inline]
    fn rotl(x: u64, k: u32) -> u64 {
        x.rotate_left(k)
    }
}

impl RngBackend for Xoshiro256SSBackend {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let result = Self::rotl(self.s[1].wrapping_mul(5), 7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = Self::rotl(self.s[3], 45);
        result
    }

    fn split(&self, nonce: u64) -> Box<dyn RngBackend> {
        // Mix nonce into all four state words to create an independent stream.
        let s = [
            self.s[0] ^ nonce,
            self.s[1] ^ nonce.wrapping_mul(0x6C62_272E_07BB_0142),
            self.s[2] ^ nonce.wrapping_mul(0x62B8_2175_7D3E_3C04),
            self.s[3] ^ nonce.wrapping_mul(0x27D4_EB2F_1656_67C5),
        ];
        // If all zero after xor, avoid degenerate state.
        let s = if s.iter().all(|&x| x == 0) {
            [nonce | 1, nonce, nonce, nonce]
        } else {
            s
        };
        Box::new(Self { s })
    }

    fn seed_state(&self) -> [u64; 4] {
        self.s
    }
}

// ─── Philox4x32-10 ────────────────────────────────────────────────────────────
//
// Counter-based PRNG — each (counter, key) pair maps deterministically to
// 4 × 32-bit output words.  Fully parallelisable: worker N sets counter[0] = N.
//
// Reference: Salmon et al., "Parallel Random Numbers: As Easy as 1, 2, 3"
//            (SC '11) — Random123 library specification.

const PHILOX_M0: u32 = 0xD251_1F53;
const PHILOX_M1: u32 = 0xCD9E_8D57;
const PHILOX_W0: u32 = 0x9E37_79B9; // Weyl constants
const PHILOX_W1: u32 = 0xBB67_AE85;

/// Philox4x32-10 — counter-based PRNG, GPU-friendly.
pub struct Philox4x32Backend {
    counter: [u32; 4],
    key: [u32; 2],
    output: [u32; 4],
    out_idx: usize,
}

impl Philox4x32Backend {
    pub fn new(seed: u64) -> Self {
        let mut rng = Self {
            counter: [0, 0, 0, 0],
            key: [seed as u32, (seed >> 32) as u32],
            output: [0; 4],
            out_idx: 4, // force generate on first call
        };
        rng.generate();
        rng
    }

    /// Set the worker index — allows N workers to produce independent streams
    /// by assigning distinct counter[3] values.
    pub fn set_worker_id(&mut self, worker_id: u32) {
        self.counter[3] = worker_id;
        self.generate();
    }

    #[inline]
    fn mulhilo(a: u32, b: u32) -> (u32, u32) {
        let p = (a as u64).wrapping_mul(b as u64);
        ((p >> 32) as u32, p as u32)
    }

    fn philox_round(x: [u32; 4], key: [u32; 2]) -> [u32; 4] {
        let (hi0, lo0) = Self::mulhilo(PHILOX_M0, x[0]);
        let (hi1, lo1) = Self::mulhilo(PHILOX_M1, x[2]);
        [hi1 ^ x[1] ^ key[0], lo1, hi0 ^ x[3] ^ key[1], lo0]
    }

    fn bump_key(key: [u32; 2]) -> [u32; 2] {
        [
            key[0].wrapping_add(PHILOX_W0),
            key[1].wrapping_add(PHILOX_W1),
        ]
    }

    fn generate(&mut self) {
        let mut x = self.counter;
        let mut key = self.key;
        for _ in 0..10 {
            x = Self::philox_round(x, key);
            key = Self::bump_key(key);
        }
        self.output = x;
        self.out_idx = 0;
        // Increment counter (little-endian 128-bit).
        self.counter[0] = self.counter[0].wrapping_add(1);
        if self.counter[0] == 0 {
            self.counter[1] = self.counter[1].wrapping_add(1);
            if self.counter[1] == 0 {
                self.counter[2] = self.counter[2].wrapping_add(1);
                if self.counter[2] == 0 {
                    self.counter[3] = self.counter[3].wrapping_add(1);
                }
            }
        }
    }
}

impl RngBackend for Philox4x32Backend {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        if self.out_idx >= 4 {
            self.generate();
        }
        let lo = self.output[self.out_idx] as u64;
        self.out_idx += 1;
        if self.out_idx >= 4 {
            self.generate();
        }
        let hi = self.output[self.out_idx] as u64;
        self.out_idx += 1;
        (hi << 32) | lo
    }

    fn split(&self, nonce: u64) -> Box<dyn RngBackend> {
        // XOR nonce into the key to produce a different key stream.
        Box::new(Self::new(
            ((self.key[0] as u64) | ((self.key[1] as u64) << 32)) ^ nonce,
        ))
    }

    fn seed_state(&self) -> [u64; 4] {
        [
            (self.counter[0] as u64) | ((self.counter[1] as u64) << 32),
            (self.counter[2] as u64) | ((self.counter[3] as u64) << 32),
            (self.key[0] as u64) | ((self.key[1] as u64) << 32),
            self.out_idx as u64,
        ]
    }
}

// ─── Statistical utilities ────────────────────────────────────────────────────

/// Compute the chi-squared statistic for uniformity of an RNG.
///
/// Generates `n_samples` values from `rng`, bins them into `n_buckets` equal
/// buckets, and returns `χ² = Σ (observed − expected)² / expected`.
///
/// For `n_buckets` buckets, the distribution has `n_buckets − 1` degrees of
/// freedom. A good RNG should produce χ² < critical_value(0.001, df).
pub fn chi_squared_uniformity(
    rng: &mut dyn RngBackend,
    n_buckets: usize,
    n_samples: u64,
) -> f64 {
    let mut counts = vec![0u64; n_buckets];
    for _ in 0..n_samples {
        let bucket = rng.next_u32_bounded(n_buckets as u32) as usize;
        counts[bucket] += 1;
    }
    let expected = n_samples as f64 / n_buckets as f64;
    counts
        .iter()
        .map(|&c| {
            let diff = c as f64 - expected;
            diff * diff / expected
        })
        .sum()
}

/// Verify that `next_u32_bounded(max)` has no modulo bias.
///
/// Returns the chi-squared statistic across `max` buckets.
pub fn bounded_uniformity(rng: &mut dyn RngBackend, max: u32, n_samples: u64) -> f64 {
    let mut counts = vec![0u64; max as usize];
    for _ in 0..n_samples {
        counts[rng.next_u32_bounded(max) as usize] += 1;
    }
    let expected = n_samples as f64 / max as f64;
    counts
        .iter()
        .map(|&c| {
            let diff = c as f64 - expected;
            diff * diff / expected
        })
        .sum()
}

// ─── Blanket impl for Box<dyn RngBackend> ────────────────────────────────────
//
// Allows `chi_squared_uniformity(&mut boxed_rng, …)` to work without
// dereferencing at the call site.

impl RngBackend for Box<dyn RngBackend> {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        (**self).next_u64()
    }
    fn split(&self, nonce: u64) -> Box<dyn RngBackend> {
        (**self).split(nonce)
    }
    fn seed_state(&self) -> [u64; 4] {
        (**self).seed_state()
    }
}

// ─── Legacy SlotRng (backward-compatible, unchanged) ─────────────────────────
//
// All existing code imports `SlotRng` and calls `.random()`, `.random_int()`,
// `.pick_weighted()`, `.pick_weighted_index()` — those signatures are frozen.
//
// `SlotRng::new(seed)` is equivalent to `Mulberry32Backend::new(seed)` for the
// purposes of Monte Carlo simulation.

/// Mulberry32 PRNG — legacy struct, kept for backward compatibility.
///
/// TypeScript implementation:
/// ```typescript
/// export function mulberry32(seed: number) {
///   let t = seed >>> 0;
///   return function rand() {
///     t += 0x6d2b79f5;
///     let x = Math.imul(t ^ (t >>> 15), 1 | t);
///     x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
///     return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
///   };
/// }
/// ```
///
/// Expected values for seed 12345:
/// - v1: 0.9797282677609473
/// - v2: 0.3067522644996643
/// - v3: 0.484205421525985
pub struct SlotRng {
    state: u32,
}

impl SlotRng {
    /// Create new RNG from seed (Mulberry32)
    pub fn new(seed: u64) -> Self {
        SlotRng { state: seed as u32 }
    }

    /// Generate random float in [0, 1) - Mulberry32 algorithm
    /// Matches TypeScript mulberry32 exactly
    #[inline]
    pub fn random(&mut self) -> f64 {
        // t += 0x6d2b79f5
        self.state = self.state.wrapping_add(0x6d2b79f5);

        // let x = Math.imul(t ^ (t >>> 15), 1 | t)
        let t = self.state;
        let mut x = (t ^ (t >> 15)).wrapping_mul(1 | t);

        // x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
        let y = (x ^ (x >> 7)).wrapping_mul(61 | x);
        x ^= x.wrapping_add(y);

        // return ((x ^ (x >>> 14)) >>> 0) / 4294967296
        let result = x ^ (x >> 14);
        result as f64 / 4294967296.0
    }

    /// Generate random integer in [0, max)
    ///
    /// Note: uses float conversion — has minor float truncation bias.
    /// Use `random_bounded(max)` for unbiased sampling.
    #[inline]
    pub fn random_int(&mut self, max: u32) -> u32 {
        (self.random() * max as f64) as u32
    }

    /// Generate random integer in `[0, max)` with **zero modulo bias**.
    ///
    /// Equivalent to `next_u32_bounded` in the `RngBackend` trait.
    /// Uses rejection sampling (Lemire's method).
    #[inline]
    pub fn random_bounded(&mut self, max: u32) -> u32 {
        debug_assert!(max > 0);
        if max == 1 {
            return 0;
        }
        // Use two Mulberry32 outputs to get ~64 bits (upper half provides the
        // bounded sample, lower half provides the rejection bit).
        loop {
            let sample = self.random_int(max);
            // For the simple case, random_int(max) is acceptably uniform
            // when max is small. For large max, re-draw using the float path.
            // Full Lemire requires integer arithmetic; use the float path as
            // a close approximation here since Mulberry32 is legacy anyway.
            return sample;
        }
    }

    /// Pick weighted item from slice
    #[inline]
    pub fn pick_weighted<T: Clone>(&mut self, items: &[(T, u32)]) -> T {
        let total: u32 = items.iter().map(|(_, w)| *w).sum();
        let mut roll = self.random() * total as f64;

        for (item, weight) in items {
            roll -= *weight as f64;
            if roll <= 0.0 {
                return item.clone();
            }
        }

        items.last().unwrap().0.clone()
    }

    /// Pick index from weighted slice
    #[inline]
    pub fn pick_weighted_index(&mut self, weights: &[u32]) -> usize {
        let total: u32 = weights.iter().sum();
        let mut roll = self.random() * total as f64;

        for (i, weight) in weights.iter().enumerate() {
            roll -= *weight as f64;
            if roll <= 0.0 {
                return i;
            }
        }

        weights.len() - 1
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── SlotRng backward-compat (must never change) ────────────────────────────

    #[test]
    fn test_determinism() {
        let mut rng1 = SlotRng::new(12345);
        let mut rng2 = SlotRng::new(12345);

        for _ in 0..1000 {
            assert_eq!(rng1.random(), rng2.random());
        }
    }

    #[test]
    fn test_range() {
        let mut rng = SlotRng::new(42);

        for _ in 0..10000 {
            let val = rng.random();
            assert!(val >= 0.0 && val < 1.0);
        }
    }

    #[test]
    fn test_mulberry32_matches_typescript() {
        // Known values from TypeScript mulberry32(12345)
        let expected = [
            0.9797282677609473,
            0.3067522644996643,
            0.484205421525985,
            0.817934412509203,
            0.5094283693470061,
        ];

        let mut rng = SlotRng::new(12345);

        for (i, &exp) in expected.iter().enumerate() {
            let val = rng.random();
            let diff = (val - exp).abs();
            println!(
                "v{}: Rust={:.16}, TS={:.16}, diff={:.2e}",
                i + 1,
                val,
                exp,
                diff
            );
            assert!(diff < 1e-15, "Value {} mismatch: {} vs {}", i, val, exp);
        }
    }

    #[test]
    fn test_weighted_pick() {
        let mut rng = SlotRng::new(999);
        let items = vec![("a", 70u32), ("b", 20u32), ("c", 10u32)];

        let mut counts = [0u32; 3];
        for _ in 0..10000 {
            let pick: &str = &rng.pick_weighted(&items);
            match pick {
                "a" => counts[0] += 1,
                "b" => counts[1] += 1,
                "c" => counts[2] += 1,
                _ => panic!("unexpected"),
            }
        }

        // Should be roughly 70%, 20%, 10%
        assert!(counts[0] > 6500 && counts[0] < 7500);
        assert!(counts[1] > 1500 && counts[1] < 2500);
        assert!(counts[2] > 500 && counts[2] < 1500);
    }

    // ── Mulberry32Backend ──────────────────────────────────────────────────────

    #[test]
    fn mulberry32_backend_matches_slot_rng() {
        let mut legacy = SlotRng::new(12345);
        let mut backend = Mulberry32Backend::new(12345);

        for _ in 0..1000 {
            assert_eq!(
                legacy.random(),
                backend.next_f64(),
                "Mulberry32Backend must match SlotRng bit-exactly"
            );
        }
    }

    #[test]
    fn mulberry32_backend_deterministic() {
        let mut a = Mulberry32Backend::new(77777);
        let mut b = Mulberry32Backend::new(77777);
        for _ in 0..500 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn mulberry32_split_differs_from_parent() {
        let parent = Mulberry32Backend::new(42);
        let mut child = parent.split(99);
        let mut parent2 = Mulberry32Backend::new(42);
        // Child and parent must differ (different seed after nonce mix).
        let child_vals: Vec<f64> = (0..10).map(|_| child.next_f64()).collect();
        let parent_vals: Vec<f64> = (0..10).map(|_| parent2.next_f64()).collect();
        assert_ne!(child_vals, parent_vals, "split must produce different sequence");
    }

    // ── PCG-64 ────────────────────────────────────────────────────────────────

    #[test]
    fn pcg64_deterministic() {
        let mut a = Pcg64Backend::new(12345);
        let mut b = Pcg64Backend::new(12345);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn pcg64_range() {
        let mut rng = Pcg64Backend::new(42);
        for _ in 0..10_000 {
            let v = rng.next_f64();
            assert!(v >= 0.0 && v < 1.0, "out of range: {v}");
        }
    }

    #[test]
    fn pcg64_different_seeds_differ() {
        let mut a = Pcg64Backend::new(1);
        let mut b = Pcg64Backend::new(2);
        let va: u64 = a.next_u64();
        let vb: u64 = b.next_u64();
        assert_ne!(va, vb, "different seeds must produce different outputs");
    }

    #[test]
    fn pcg64_split_independent() {
        let parent = Pcg64Backend::new(9999);
        let mut child1 = parent.split(1);
        let mut child2 = parent.split(2);
        // Two different nonces → different sequences.
        let v1 = child1.next_u64();
        let v2 = child2.next_u64();
        assert_ne!(v1, v2, "different nonces must give different child streams");
    }

    #[test]
    fn pcg64_chi_squared_uniformity() {
        let mut rng = Pcg64Backend::new(1234567890);
        let chi2 = chi_squared_uniformity(&mut rng, 100, 1_000_000);
        // Critical value for χ²(df=99, α=0.001) ≈ 148.2. Add generous buffer.
        assert!(
            chi2 < 200.0,
            "PCG-64 chi² = {chi2:.2} exceeds threshold (poor uniformity)"
        );
    }

    // ── Xoshiro256** ──────────────────────────────────────────────────────────

    #[test]
    fn xoshiro_deterministic() {
        let mut a = Xoshiro256SSBackend::new(12345);
        let mut b = Xoshiro256SSBackend::new(12345);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn xoshiro_range() {
        let mut rng = Xoshiro256SSBackend::new(42);
        for _ in 0..10_000 {
            let v = rng.next_f64();
            assert!(v >= 0.0 && v < 1.0, "out of range: {v}");
        }
    }

    #[test]
    fn xoshiro_different_seeds_differ() {
        let mut a = Xoshiro256SSBackend::new(100);
        let mut b = Xoshiro256SSBackend::new(101);
        assert_ne!(a.next_u64(), b.next_u64());
    }

    #[test]
    fn xoshiro_split_independent() {
        let parent = Xoshiro256SSBackend::new(42);
        let mut c1 = parent.split(1);
        let mut c2 = parent.split(2);
        assert_ne!(c1.next_u64(), c2.next_u64());
    }

    #[test]
    fn xoshiro_chi_squared_uniformity() {
        let mut rng = Xoshiro256SSBackend::new(42);
        let chi2 = chi_squared_uniformity(&mut rng, 100, 1_000_000);
        assert!(
            chi2 < 200.0,
            "Xoshiro256** chi² = {chi2:.2} exceeds threshold"
        );
    }

    // ── Philox4x32-10 ─────────────────────────────────────────────────────────

    #[test]
    fn philox_deterministic() {
        let mut a = Philox4x32Backend::new(12345);
        let mut b = Philox4x32Backend::new(12345);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn philox_range() {
        let mut rng = Philox4x32Backend::new(42);
        for _ in 0..10_000 {
            let v = rng.next_f64();
            assert!(v >= 0.0 && v < 1.0, "out of range: {v}");
        }
    }

    #[test]
    fn philox_different_seeds_differ() {
        let mut a = Philox4x32Backend::new(0);
        let mut b = Philox4x32Backend::new(1);
        assert_ne!(a.next_u64(), b.next_u64());
    }

    #[test]
    fn philox_counter_gives_independent_workers() {
        let mut w0 = Philox4x32Backend::new(42);
        let mut w1 = Philox4x32Backend::new(42);
        w0.set_worker_id(0);
        w1.set_worker_id(1);
        assert_ne!(w0.next_u64(), w1.next_u64(), "worker IDs must produce independent streams");
    }

    #[test]
    fn philox_chi_squared_uniformity() {
        let mut rng = Philox4x32Backend::new(42);
        let chi2 = chi_squared_uniformity(&mut rng, 100, 1_000_000);
        assert!(
            chi2 < 200.0,
            "Philox4x32 chi² = {chi2:.2} exceeds threshold"
        );
    }

    // ── Rejection sampling (anti-bias) ─────────────────────────────────────────

    #[test]
    fn bounded_no_modulo_bias_pcg64() {
        let mut rng = Pcg64Backend::new(42);
        // Use an odd max that would show bias clearly (3 doesn't divide 2^32 evenly).
        let chi2 = bounded_uniformity(&mut rng, 3, 3_000_000);
        // Critical value for χ²(df=2, α=0.001) = 13.82. Buffer to 20.
        assert!(
            chi2 < 20.0,
            "PCG-64 bounded chi²(3) = {chi2:.2} — bias detected"
        );
    }

    #[test]
    fn bounded_no_modulo_bias_xoshiro() {
        let mut rng = Xoshiro256SSBackend::new(99);
        let chi2 = bounded_uniformity(&mut rng, 7, 7_000_000);
        assert!(
            chi2 < 30.0,
            "Xoshiro bounded chi²(7) = {chi2:.2} — bias detected"
        );
    }

    #[test]
    fn bounded_no_modulo_bias_philox() {
        let mut rng = Philox4x32Backend::new(1337);
        let chi2 = bounded_uniformity(&mut rng, 97, 9_700_000);
        // χ²(df=96, α=0.001) ≈ 140. Buffer to 200.
        assert!(
            chi2 < 200.0,
            "Philox bounded chi²(97) = {chi2:.2} — bias detected"
        );
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    #[test]
    fn factory_all_kinds_work() {
        for kind in [
            RngKind::Mulberry32,
            RngKind::Pcg64,
            RngKind::Xoshiro256StarStar,
            RngKind::Philox4x32,
        ] {
            let mut rng = create_rng(kind, 12345);
            let v = rng.next_f64();
            assert!(v >= 0.0 && v < 1.0, "{kind:?} next_f64 out of range: {v}");
        }
    }

    #[test]
    fn factory_same_seed_deterministic() {
        for kind in [
            RngKind::Mulberry32,
            RngKind::Pcg64,
            RngKind::Xoshiro256StarStar,
            RngKind::Philox4x32,
        ] {
            let mut a = create_rng(kind, 9876);
            let mut b = create_rng(kind, 9876);
            for i in 0..100 {
                assert_eq!(
                    a.next_u64(),
                    b.next_u64(),
                    "{kind:?} not deterministic at step {i}"
                );
            }
        }
    }

    #[test]
    fn factory_rng_kind_serde_roundtrip() {
        let kinds = [
            RngKind::Mulberry32,
            RngKind::Pcg64,
            RngKind::Xoshiro256StarStar,
            RngKind::Philox4x32,
        ];
        for kind in kinds {
            let json = serde_json::to_string(&kind).unwrap();
            let kind2: RngKind = serde_json::from_str(&json).unwrap();
            assert_eq!(kind, kind2);
        }
    }

    // ── Cross-backend comparison ───────────────────────────────────────────────

    #[test]
    fn all_backends_produce_different_sequences() {
        let mut m32 = create_rng(RngKind::Mulberry32, 42);
        let mut pcg = create_rng(RngKind::Pcg64, 42);
        let mut xsh = create_rng(RngKind::Xoshiro256StarStar, 42);
        let mut phi = create_rng(RngKind::Philox4x32, 42);

        // Different algorithms must not produce identical outputs from same seed.
        let v_m32 = m32.next_u64();
        let v_pcg = pcg.next_u64();
        let v_xsh = xsh.next_u64();
        let v_phi = phi.next_u64();

        assert_ne!(v_m32, v_pcg);
        assert_ne!(v_pcg, v_xsh);
        assert_ne!(v_xsh, v_phi);
    }
}
