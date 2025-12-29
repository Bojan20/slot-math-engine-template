/**
 * SLOT MATH ENGINE TEMPLATE - Spin Engine
 *
 * Handles the core spin mechanics:
 * - Reel stop position selection
 * - Grid generation from reel strips
 * - Window extraction
 */
import { SymbolId } from '../model/symbols.js';
import { RNG } from './rng.js';
/**
 * 5x3 grid representation
 * grid[row][reel] = symbol
 */
export type Grid = SymbolId[][];
/**
 * Stop positions for each reel
 */
export type StopPositions = number[];
/**
 * Spin result containing grid and stop positions
 */
export interface SpinData {
    grid: Grid;
    stopPositions: StopPositions;
    isFreeSpins: boolean;
}
/**
 * Generate random stop positions for all reels
 */
export declare function generateStopPositions(rng: RNG, isFreeSpins?: boolean): StopPositions;
/**
 * Build grid from stop positions
 * Each reel window shows 3 symbols starting from stop position
 */
export declare function buildGrid(stopPositions: StopPositions, isFreeSpins?: boolean): Grid;
/**
 * Perform a single spin
 */
export declare function spin(rng: RNG, isFreeSpins?: boolean): SpinData;
/**
 * Get symbol at specific grid position
 */
export declare function getSymbolAtPosition(grid: Grid, row: number, reel: number): SymbolId;
/**
 * Get all symbols on a specific reel (column)
 */
export declare function getReelSymbols(grid: Grid, reel: number): SymbolId[];
/**
 * Get all symbols in a specific row
 */
export declare function getRowSymbols(grid: Grid, row: number): SymbolId[];
/**
 * Count occurrences of a symbol in the grid
 */
export declare function countSymbol(grid: Grid, symbol: SymbolId): number;
/**
 * Find all positions of a symbol in the grid
 */
export declare function findSymbolPositions(grid: Grid, symbol: SymbolId): Array<{
    row: number;
    reel: number;
}>;
/**
 * Pretty print grid for debugging
 */
export declare function printGrid(grid: Grid): string;
/**
 * Clone a grid (deep copy)
 */
export declare function cloneGrid(grid: Grid): Grid;
//# sourceMappingURL=spin.d.ts.map