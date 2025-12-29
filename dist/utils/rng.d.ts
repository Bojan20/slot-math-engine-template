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
/**
 * Seeded RNG instance using xoroshiro128+
 */
export declare class RNG {
    private gen;
    private initialSeed;
    constructor(seed: number);
    /**
     * Get the initial seed used to create this RNG
     */
    getSeed(): number;
    /**
     * Generate random float in [0, 1)
     * Primary method for slot mechanics
     */
    nextFloat(): number;
    /**
     * Generate random integer in [min, max] inclusive
     */
    nextInt(min: number, max: number): number;
    /**
     * Generate random integer in [0, max) exclusive
     */
    nextIntExclusive(max: number): number;
    /**
     * Pick random element from array
     */
    pick<T>(array: T[]): T;
    /**
     * Weighted random selection
     * Returns index of selected weight
     */
    weightedSelect(weights: number[]): number;
    /**
     * Weighted random selection returning the value
     */
    weightedPick<T>(items: T[], weights: number[]): T;
    /**
     * Shuffle array in-place (Fisher-Yates)
     */
    shuffle<T>(array: T[]): T[];
    /**
     * Get shuffled copy of array
     */
    shuffled<T>(array: T[]): T[];
    /**
     * Boolean with probability p
     */
    chance(probability: number): boolean;
    /**
     * Clone RNG at current state
     */
    clone(): RNG;
    /**
     * Skip ahead n values (for parallel simulation)
     */
    skip(n: number): void;
}
/**
 * Create seeded RNG instance
 */
export declare function createRNG(seed: number): RNG;
/**
 * Derive deterministic worker seed from base seed and worker index
 * Uses xxHash-style mixing for quality distribution
 */
export declare function deriveWorkerSeed(baseSeed: number, workerIndex: number): number;
/**
 * Derive array of worker seeds
 */
export declare function deriveWorkerSeeds(baseSeed: number, workerCount: number): number[];
/**
 * Generate random seed from system entropy
 */
export declare function randomSeed(): number;
export declare function getGlobalRNG(): RNG;
export declare function setGlobalSeed(seed: number): void;
//# sourceMappingURL=rng.d.ts.map