/**
 * SLOT MATH ENGINE TEMPLATE - Payline Definitions
 *
 * 10 fixed paylines on a 5x3 grid
 * Grid positions (row, col):
 *   [0,0] [0,1] [0,2] [0,3] [0,4]  <- Top row
 *   [1,0] [1,1] [1,2] [1,3] [1,4]  <- Middle row
 *   [2,0] [2,1] [2,2] [2,3] [2,4]  <- Bottom row
 *
 * Paylines evaluate Left-to-Right only
 * Each payline is an array of row indices per reel [reel0Row, reel1Row, ...]
 */
export type PaylineDefinition = [number, number, number, number, number];
/**
 * Standard 10-line payline configuration
 * Classic pattern covering key positions
 */
export declare const PAYLINES: PaylineDefinition[];
export declare const NUM_PAYLINES: number;
export declare const NUM_REELS = 5;
export declare const NUM_ROWS = 3;
/**
 * Payline visualization helper
 * Returns ASCII art of a payline on the grid
 */
export declare function visualizePayline(lineIndex: number): string;
/**
 * Get all grid positions covered by paylines
 * Returns Set of "row,col" strings
 */
export declare function getCoveredPositions(): Set<string>;
/**
 * Validate payline definitions
 * Ensures all positions are within grid bounds
 */
export declare function validatePaylines(): boolean;
//# sourceMappingURL=paylines.d.ts.map