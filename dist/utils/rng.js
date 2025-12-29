/**
 * SLOT MATH ENGINE TEMPLATE - Deterministic RNG Wrapper
 *
 * Uses pure-rand xoroshiro128+ algorithm for:
 * - Industry-standard slot simulation
 * - Deterministic reproducibility
 * - Excellent statistical properties
 * - Fast performance
 *
 * Every simulation result is reproducible with the same seed.
 */
import * as prand from 'pure-rand';
/**
 * Seeded RNG instance using xoroshiro128+
 */
export class RNG {
    gen;
    initialSeed;
    constructor(seed) {
        this.initialSeed = seed;
        this.gen = prand.xoroshiro128plus(seed);
    }
    /**
     * Get the initial seed used to create this RNG
     */
    getSeed() {
        return this.initialSeed;
    }
    /**
     * Generate random float in [0, 1)
     * Primary method for slot mechanics
     */
    nextFloat() {
        const [value, nextGen] = prand.uniformIntDistribution(0, 0x7fffffff, this.gen);
        this.gen = nextGen;
        return value / 0x80000000;
    }
    /**
     * Generate random integer in [min, max] inclusive
     */
    nextInt(min, max) {
        const [value, nextGen] = prand.uniformIntDistribution(min, max, this.gen);
        this.gen = nextGen;
        return value;
    }
    /**
     * Generate random integer in [0, max) exclusive
     */
    nextIntExclusive(max) {
        return this.nextInt(0, max - 1);
    }
    /**
     * Pick random element from array
     */
    pick(array) {
        if (array.length === 0) {
            throw new Error('Cannot pick from empty array');
        }
        return array[this.nextInt(0, array.length - 1)];
    }
    /**
     * Weighted random selection
     * Returns index of selected weight
     */
    weightedSelect(weights) {
        const total = weights.reduce((a, b) => a + b, 0);
        let roll = this.nextFloat() * total;
        for (let i = 0; i < weights.length; i++) {
            roll -= weights[i];
            if (roll <= 0)
                return i;
        }
        return weights.length - 1;
    }
    /**
     * Weighted random selection returning the value
     */
    weightedPick(items, weights) {
        if (items.length !== weights.length) {
            throw new Error('Items and weights must have same length');
        }
        return items[this.weightedSelect(weights)];
    }
    /**
     * Shuffle array in-place (Fisher-Yates)
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    /**
     * Get shuffled copy of array
     */
    shuffled(array) {
        return this.shuffle([...array]);
    }
    /**
     * Boolean with probability p
     */
    chance(probability) {
        return this.nextFloat() < probability;
    }
    /**
     * Clone RNG at current state
     */
    clone() {
        const cloned = new RNG(this.initialSeed);
        cloned.gen = this.gen;
        return cloned;
    }
    /**
     * Skip ahead n values (for parallel simulation)
     */
    skip(n) {
        for (let i = 0; i < n; i++) {
            this.nextFloat();
        }
    }
}
/**
 * Create seeded RNG instance
 */
export function createRNG(seed) {
    return new RNG(seed);
}
/**
 * Derive deterministic worker seed from base seed and worker index
 * Uses xxHash-style mixing for quality distribution
 */
export function deriveWorkerSeed(baseSeed, workerIndex) {
    // Mix seed and index using prime multipliers
    let h = baseSeed >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= workerIndex;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
}
/**
 * Derive array of worker seeds
 */
export function deriveWorkerSeeds(baseSeed, workerCount) {
    const seeds = [];
    for (let i = 0; i < workerCount; i++) {
        seeds.push(deriveWorkerSeed(baseSeed, i));
    }
    return seeds;
}
/**
 * Generate random seed from system entropy
 */
export function randomSeed() {
    return Math.floor(Math.random() * 0xffffffff);
}
/**
 * Global RNG for quick operations (not recommended for simulation)
 */
let globalRng = null;
export function getGlobalRNG() {
    if (!globalRng) {
        globalRng = new RNG(randomSeed());
    }
    return globalRng;
}
export function setGlobalSeed(seed) {
    globalRng = new RNG(seed);
}
//# sourceMappingURL=rng.js.map