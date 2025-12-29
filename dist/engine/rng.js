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
    state0;
    state1;
    constructor(seed) {
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
    splitmix64(state) {
        state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
        state = ((state ^ (state >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
        state = ((state ^ (state >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
        return (state ^ (state >> 31n)) & 0xffffffffffffffffn;
    }
    /**
     * Generate next random 64-bit value (xorshift128+)
     */
    next() {
        let s1 = this.state0;
        const s0 = this.state1;
        this.state0 = s0;
        s1 ^= (s1 << 23n) & 0xffffffffffffffffn;
        s1 ^= s1 >> 18n;
        s1 ^= s0;
        s1 ^= s0 >> 5n;
        this.state1 = s1;
        return (s0 + s1) & 0xffffffffffffffffn;
    }
    /**
     * Get random float in [0, 1)
     */
    random() {
        const value = this.next();
        // Use upper 53 bits for double precision
        // Note: (1 << 53) doesn't work in JS, must use 2**53
        return Number(value >> 11n) / (2 ** 53);
    }
    /**
     * Get random integer in [0, max)
     */
    nextInt(max) {
        return Math.floor(this.random() * max);
    }
    /**
     * Get random integer in [min, max]
     */
    nextIntRange(min, max) {
        return min + Math.floor(this.random() * (max - min + 1));
    }
    /**
     * Select from weighted options
     * @param weights Array of weights (must sum to total)
     * @returns Index of selected option
     */
    weightedSelect(weights) {
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
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    /**
     * Get current state for serialization/debugging
     */
    getState() {
        return {
            state0: this.state0.toString(16),
            state1: this.state1.toString(16)
        };
    }
    /**
     * Restore state for replay
     */
    setState(state) {
        this.state0 = BigInt('0x' + state.state0);
        this.state1 = BigInt('0x' + state.state1);
    }
    /**
     * Clone RNG with current state
     */
    clone() {
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
export function getGlobalRng() {
    return globalRng;
}
export function seedGlobalRng(seed) {
    globalRng = new RNG(seed);
}
export function createRng(seed) {
    return new RNG(seed);
}
//# sourceMappingURL=rng.js.map