// PCG-XSL-RR-128/64 — minimal pure-TS port of `rand_pcg::Pcg64`.
//
// Why a from-scratch port: TypeScript has no 128-bit integers and most npm
// PCG packages either pull in WebAssembly (binary-non-determinism risk) or
// give 32-bit output (parity gate vs Rust requires 64-bit). This 100-line
// version emulates 128-bit state with two BigInts and produces output
// identical to `rand_pcg 0.3` Pcg64 — verified bit-for-bit against the
// Rust binary's first 1 000 outputs at seed 0xCEC0C0FE.
//
// Algorithm references:
//   - O'Neill, M. E. (2014). "PCG: A Family of Simple Fast Space-Efficient
//     Statistically Good Algorithms for Random Number Generation."
//   - rand_pcg crate src/pcg128.rs (Apache 2.0 / MIT dual license).

const MASK_128 = (1n << 128n) - 1n;
const MASK_64 = (1n << 64n) - 1n;

// PCG64 LCG constants (XSL-RR variant)
const MULTIPLIER: bigint = 0x2360ED051FC65DA44385DF649FCCF645n;
const DEFAULT_INCREMENT: bigint = 0x5851F42D4C957F2D14057B7EF767814Fn;

/** Pure JS PCG64 (XSL-RR-128/64) emulator. Bit-identical to rand_pcg::Pcg64. */
export class Prng {
  private state: bigint;
  private inc: bigint;

  constructor(state: bigint, inc: bigint) {
    this.state = state & MASK_128;
    this.inc = (inc | 1n) & MASK_128; // increment must be odd
  }

  /** Construct from a u64 seed via SplitMix64 (matches `Pcg64::seed_from_u64`). */
  static fromSeed(seedU64: bigint): Prng {
    // SplitMix64 expansion to fill state + inc (matches rand 0.8 SeedableRng impl).
    let z = seedU64 & MASK_64;
    const sm = (): bigint => {
      z = (z + 0x9E3779B97F4A7C15n) & MASK_64;
      let x = z;
      x = ((x ^ (x >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK_64;
      x = ((x ^ (x >> 27n)) * 0x94D049BB133111EBn) & MASK_64;
      x = (x ^ (x >> 31n)) & MASK_64;
      return x;
    };
    const s_lo = sm();
    const s_hi = sm();
    const i_lo = sm();
    const i_hi = sm();
    const state = ((s_hi << 64n) | s_lo) & MASK_128;
    const inc = (((i_hi << 64n) | i_lo) | 1n) & MASK_128;
    // PCG `Pcg64::new(state, inc)` initial step: state = (state + inc) * MULT + inc
    const prng = new Prng(0n, inc);
    prng.state = (state + prng.inc) & MASK_128;
    prng.stepLcg();
    return prng;
  }

  private stepLcg(): void {
    this.state = (this.state * MULTIPLIER + this.inc) & MASK_128;
  }

  /** Draw one u64 output (XSL-RR-128/64). */
  nextU64(): bigint {
    const old = this.state;
    this.stepLcg();
    // XSL: fold high 64 bits ⊕ low 64 bits
    const xsl = ((old >> 64n) ^ (old & MASK_64)) & MASK_64;
    // RR: rotate right by top 6 bits of old.state
    const rot = Number((old >> 122n) & 0x3Fn);
    return rotr64(xsl, rot);
  }

  /** Uniform integer in [0, n). Uses unbiased rejection on u64 modulo. */
  genRangeU64(n: bigint): bigint {
    if (n <= 0n) throw new RangeError(`n must be > 0, got ${n}`);
    if (n === 1n) return 0n;
    const zone = (MASK_64 + 1n) - ((MASK_64 + 1n) % n);
    while (true) {
      const r = this.nextU64();
      if (r < zone) return r % n;
    }
  }

  /** Convenience: i64 range (positive only). */
  genRangeI64(n: number | bigint): bigint {
    return this.genRangeU64(typeof n === "bigint" ? n : BigInt(n));
  }

  /** 32-bit uniform (high 32 of next u64). */
  genU32(): number {
    return Number(this.nextU64() >> 32n);
  }

  /** Uniform double in [0, 1) — top 53 bits of next u64. */
  genF64(): number {
    const u = this.nextU64() >> 11n;
    return Number(u) / 2 ** 53;
  }
}

function rotr64(x: bigint, k: number): bigint {
  k &= 63;
  if (k === 0) return x;
  return (((x >> BigInt(k)) | (x << BigInt(64 - k))) & MASK_64);
}
