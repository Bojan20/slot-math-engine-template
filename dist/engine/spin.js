/**
 * SLOT MATH ENGINE TEMPLATE - Spin Engine
 *
 * Handles the core spin mechanics:
 * - Reel stop position selection
 * - Grid generation from reel strips
 * - Window extraction
 */
import { BASE_REELS, FREE_SPINS_REELS, getWindow } from '../model/reels.js';
import { NUM_REELS, NUM_ROWS } from '../model/paylines.js';
/**
 * Generate random stop positions for all reels
 */
export function generateStopPositions(rng, isFreeSpins = false) {
    const reels = isFreeSpins ? FREE_SPINS_REELS : BASE_REELS;
    const stops = [];
    for (let i = 0; i < NUM_REELS; i++) {
        const reelLength = reels[i].length;
        stops.push(rng.nextInt(reelLength));
    }
    return stops;
}
/**
 * Build grid from stop positions
 * Each reel window shows 3 symbols starting from stop position
 */
export function buildGrid(stopPositions, isFreeSpins = false) {
    const grid = [];
    // Initialize empty grid (rows x reels)
    for (let row = 0; row < NUM_ROWS; row++) {
        grid.push([]);
    }
    // Fill grid from reel windows
    for (let reel = 0; reel < NUM_REELS; reel++) {
        const window = getWindow(reel, stopPositions[reel], isFreeSpins);
        for (let row = 0; row < NUM_ROWS; row++) {
            grid[row][reel] = window[row];
        }
    }
    return grid;
}
/**
 * Perform a single spin
 */
export function spin(rng, isFreeSpins = false) {
    const stopPositions = generateStopPositions(rng, isFreeSpins);
    const grid = buildGrid(stopPositions, isFreeSpins);
    return {
        grid,
        stopPositions,
        isFreeSpins
    };
}
/**
 * Get symbol at specific grid position
 */
export function getSymbolAtPosition(grid, row, reel) {
    return grid[row][reel];
}
/**
 * Get all symbols on a specific reel (column)
 */
export function getReelSymbols(grid, reel) {
    return grid.map(row => row[reel]);
}
/**
 * Get all symbols in a specific row
 */
export function getRowSymbols(grid, row) {
    return grid[row];
}
/**
 * Count occurrences of a symbol in the grid
 */
export function countSymbol(grid, symbol) {
    let count = 0;
    for (let row = 0; row < NUM_ROWS; row++) {
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (grid[row][reel] === symbol) {
                count++;
            }
        }
    }
    return count;
}
/**
 * Find all positions of a symbol in the grid
 */
export function findSymbolPositions(grid, symbol) {
    const positions = [];
    for (let row = 0; row < NUM_ROWS; row++) {
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (grid[row][reel] === symbol) {
                positions.push({ row, reel });
            }
        }
    }
    return positions;
}
/**
 * Pretty print grid for debugging
 */
export function printGrid(grid) {
    const lines = [];
    lines.push('┌─────────────────────────────────┐');
    for (let row = 0; row < NUM_ROWS; row++) {
        const symbols = grid[row].map(s => {
            // Abbreviate symbol names for display
            const name = s.replace('LP_', '').replace('HP_', '').replace('_', '');
            return name.substring(0, 5).padEnd(5);
        });
        lines.push(`│ ${symbols.join(' │ ')} │`);
        if (row < NUM_ROWS - 1) {
            lines.push('├─────────────────────────────────┤');
        }
    }
    lines.push('└─────────────────────────────────┘');
    return lines.join('\n');
}
/**
 * Clone a grid (deep copy)
 */
export function cloneGrid(grid) {
    return grid.map(row => [...row]);
}
//# sourceMappingURL=spin.js.map