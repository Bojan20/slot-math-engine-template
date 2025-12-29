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
export declare class RNG {
    private state0;
    private state1;
    constructor(seed?: number);
    /**
     * Splitmix64 for seed initialization
     */
    private splitmix64;
    /**
     * Generate next random 64-bit value (xorshift128+)
     */
    private next;
    /**
     * Get random float in [0, 1)
     */
    random(): number;
    /**
     * Get random integer in [0, max)
     */
    nextInt(max: number): number;
    /**
     * Get random integer in [min, max]
     */
    nextIntRange(min: number, max: number): number;
    /**
     * Select from weighted options
     * @param weights Array of weights (must sum to total)
     * @returns Index of selected option
     */
    weightedSelect(weights: number[]): number;
    /**
     * Shuffle array in place (Fisher-Yates)
     */
    shuffle<T>(array: T[]): T[];
    /**
     * Get current state for serialization/debugging
     */
    getState(): {
        state0: string;
        state1: string;
    };
    /**
     * Restore state for replay
     */
    setState(state: {
        state0: string;
        state1: string;
    }): void;
    /**
     * Clone RNG with current state
     */
    clone(): RNG;
}
export declare function getGlobalRng(): RNG;
export declare function seedGlobalRng(seed: number): void;
export declare function createRng(seed?: number): RNG;
//# sourceMappingURL=rng.d.ts.map