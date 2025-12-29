/**
 * SLOT MATH ENGINE TEMPLATE - RNG Engine
 *
 * Deterministic PRNG for reproducible simulations.
 * Uses xorshift128+ algorithm - fast, statistically solid, seedable.
 *
 * Properties:
 * - Period: 2^128 - 1
 * - Passes BigCrush tests
 * - Deterministic: same seed = same sequence
 */

export class RNG {
  private state0: bigint;
  private state1: bigint;

  constructor(seed?: number) {
    // Initialize with seed or random
    const s = seed !== undefined ? seed : Math.floor(Math.random() * 0xFFFFFFFF);

    // Use splitmix64 to initialize state from single seed
    let state = BigInt(s);

    state = this.splitmix64(state);
    this.state0 = state;

    state = this.splitmix64(state);
    this.state1 = state;
  }

  /**
   * Splitmix64 for seed initialization
   */
  private splitmix64(state: bigint): bigint {
    state = (state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    state = ((state ^ (state >> 30n)) * 0xBF58476D1CE4E5B9n) & 0xFFFFFFFFFFFFFFFFn;
    state = ((state ^ (state >> 27n)) * 0x94D049BB133111EBn) & 0xFFFFFFFFFFFFFFFFn;
    return (state ^ (state >> 31n)) & 0xFFFFFFFFFFFFFFFFn;
  }

  /**
   * Generate next random 64-bit value (xorshift128+)
   */
  private next(): bigint {
    let s1 = this.state0;
    const s0 = this.state1;

    this.state0 = s0;
    s1 ^= (s1 << 23n) & 0xFFFFFFFFFFFFFFFFn;
    s1 ^= s1 >> 18n;
    s1 ^= s0;
    s1 ^= s0 >> 5n;
    this.state1 = s1;

    return (s0 + s1) & 0xFFFFFFFFFFFFFFFFn;
  }

  /**
   * Get random float in [0, 1)
   */
  random(): number {
    const value = this.next();
    // Use upper 53 bits for double precision
    // Note: (1 << 53) doesn't work in JS, must use 2**53
    return Number(value >> 11n) / (2 ** 53);
  }

  /**
   * Get random integer in [0, max)
   */
  nextInt(max: number): number {
    return Math.floor(this.random() * max);
  }

  /**
   * Get random integer in [min, max]
   */
  nextIntRange(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  /**
   * Select from weighted options
   * @param weights Array of weights (must sum to total)
   * @returns Index of selected option
   */
  weightedSelect(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.random() * total;

    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        return i;
      }
    }

    // Fallback (shouldn't happen with proper weights)
    return weights.length - 1;
  }

  /**
   * Shuffle array in place (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Get current state for serialization/debugging
   */
  getState(): { state0: string; state1: string } {
    return {
      state0: this.state0.toString(16),
      state1: this.state1.toString(16)
    };
  }

  /**
   * Restore state for replay
   */
  setState(state: { state0: string; state1: string }): void {
    this.state0 = BigInt('0x' + state.state0);
    this.state1 = BigInt('0x' + state.state1);
  }

  /**
   * Clone RNG with current state
   */
  clone(): RNG {
    const cloned = new RNG(0);
    cloned.state0 = this.state0;
    cloned.state1 = this.state1;
    return cloned;
  }
}

/**
 * Global RNG instance for simulation
 * Can be reseeded between runs
 */
let globalRng = new RNG();

export function getGlobalRng(): RNG {
  return globalRng;
}

export function seedGlobalRng(seed: number): void {
  globalRng = new RNG(seed);
}

export function createRng(seed?: number): RNG {
  return new RNG(seed);
}
