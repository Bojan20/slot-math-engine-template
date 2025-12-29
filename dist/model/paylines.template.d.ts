/**
 * PAYLINES TEMPLATE
 *
 * Kopiraj u paylines.ts i prilagodi za svoju igru.
 *
 * TIPOVI PAYLINE SISTEMA:
 * - 10 lines: Classic, low volatility
 * - 20 lines: Standard, medium volatility
 * - 25 lines: Extended coverage
 * - 243 ways: All ways pay (3 rows × 3 rows × 3 rows × 3 rows × 3 rows)
 * - 1024 ways: 4 rows × 5 reels
 */
export declare const NUM_REELS = 5;
export declare const NUM_ROWS = 3;
/**
 * Grid positions (row, col):
 *   [0,0] [0,1] [0,2] [0,3] [0,4]  <- Top row
 *   [1,0] [1,1] [1,2] [1,3] [1,4]  <- Middle row
 *   [2,0] [2,1] [2,2] [2,3] [2,4]  <- Bottom row
 */
export type PaylineDefinition = number[];
export declare const PAYLINES_10: PaylineDefinition[];
export declare const PAYLINES_20: PaylineDefinition[];
/**
 * 243 Ways = 3^5
 * Any symbol on adjacent reels from left wins
 * No specific payline patterns needed
 */
export declare const WAYS_243: {
    type: "ways";
    rows: number;
    reels: number;
    totalWays: number;
};
/**
 * 1024 Ways = 4^5
 * For 4-row games
 */
export declare const WAYS_1024: {
    type: "ways";
    rows: number;
    reels: number;
    totalWays: number;
};
export declare const PAYLINES: PaylineDefinition[];
export declare const NUM_PAYLINES: number;
export declare function visualizePayline(lineIndex: number): string;
export declare function validatePaylines(): boolean;
/**
 * Calculate ways multiplier for a win
 * Used for ways-pays games
 */
export declare function calculateWaysMultiplier(symbolCountsPerReel: number[]): number;
//# sourceMappingURL=paylines.template.d.ts.map