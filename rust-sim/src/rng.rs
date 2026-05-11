//! Random Number Generator Module
//!
//! Uses Mulberry32 for TypeScript compatibility.
//! Identical algorithm ensures RTP matches between TS and Rust.

/// Mulberry32 PRNG - Exact match to TypeScript version
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
    #[inline]
    pub fn random_int(&mut self, max: u32) -> u32 {
        (self.random() * max as f64) as u32
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
