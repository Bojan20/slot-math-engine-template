/**
 * SLOT MATH ENGINE TEMPLATE - BigInt Statistics
 *
 * For large simulations (>1B spins), standard number type can overflow
 * when calculating sum of squared wins for variance.
 *
 * Example:
 * - 1B spins × avg win 100 credits × avg win 100 credits = 10^22
 * - Number.MAX_SAFE_INTEGER = ~9 × 10^15
 * - OVERFLOW!
 *
 * This module provides bigint-based accumulators for:
 * - sumWinSquared (variance calculation)
 * - sumWinCredits (RTP calculation at extreme scale)
 */
/**
 * BigInt accumulator for sum of squared wins
 * Used for variance calculation at >1B spin scale
 */
export declare class BigIntSumSquared {
    private value;
    /**
     * Add (win^2) to the accumulator
     * @param win Win amount (credits or multiplier × scale)
     */
    add(win: number): void;
    /**
     * Add pre-squared value (for merging)
     */
    addSquared(squaredValue: bigint): void;
    /**
     * Get raw bigint value
     */
    getValue(): bigint;
    /**
     * Convert to number (for final variance calculation)
     * Note: May lose precision if value > Number.MAX_SAFE_INTEGER
     * but variance calculation divides by N, bringing it back to safe range
     */
    toNumber(): number;
    /**
     * Serialize for worker transfer
     */
    serialize(): string;
    /**
     * Deserialize from worker data
     */
    static deserialize(serialized: string): BigIntSumSquared;
    /**
     * Merge with another accumulator
     */
    merge(other: BigIntSumSquared): void;
    /**
     * Reset accumulator
     */
    reset(): void;
}
/**
 * BigInt accumulator for sum of wins
 * Used when total win could exceed MAX_SAFE_INTEGER
 * (e.g., 10B spins × 10 avg win × 100 credit scale = 10^13, safe but close)
 */
export declare class BigIntSum {
    private value;
    private count;
    add(value: number): void;
    getValue(): bigint;
    getCount(): bigint;
    toNumber(): number;
    getCountAsNumber(): number;
    serialize(): {
        value: string;
        count: string;
    };
    static deserialize(data: {
        value: string;
        count: string;
    }): BigIntSum;
    merge(other: BigIntSum): void;
    reset(): void;
}
/**
 * Calculate variance using bigint sum of squares
 * @param sumSq Sum of squared values (bigint)
 * @param sum Sum of values
 * @param count Number of samples
 * @returns Variance as number
 */
export declare function calculateVarianceBigInt(sumSq: bigint, sum: number, count: number): number;
/**
 * Safe check if number needs bigint treatment
 */
export declare function needsBigInt(value: number): boolean;
/**
 * Threshold for when to use bigint accumulators
 * At 100M spins with 1000x max win, sumWinSq could reach ~10^16
 * At 1B spins, definitely need bigint
 */
export declare const BIGINT_SPIN_THRESHOLD = 100000000;
/**
 * Helper to determine if simulation scale needs bigint
 */
export declare function shouldUseBigInt(spinCount: number, maxExpectedWin: number): boolean;
//# sourceMappingURL=bigintStats.d.ts.map