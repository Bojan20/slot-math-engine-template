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
/**
 * Standard 10-line payline configuration
 * Classic pattern covering key positions
 */
export const PAYLINES = [
    // Line 1: Middle straight
    [1, 1, 1, 1, 1],
    // Line 2: Top straight
    [0, 0, 0, 0, 0],
    // Line 3: Bottom straight
    [2, 2, 2, 2, 2],
    // Line 4: V shape (top to bottom to top)
    [0, 1, 2, 1, 0],
    // Line 5: Inverted V (bottom to top to bottom)
    [2, 1, 0, 1, 2],
    // Line 6: Top zigzag down
    [0, 0, 1, 2, 2],
    // Line 7: Bottom zigzag up
    [2, 2, 1, 0, 0],
    // Line 8: Wave down from middle
    [1, 0, 0, 0, 1],
    // Line 9: Wave up from middle
    [1, 2, 2, 2, 1],
    // Line 10: Diamond center
    [1, 0, 1, 2, 1]
];
export const NUM_PAYLINES = PAYLINES.length;
export const NUM_REELS = 5;
export const NUM_ROWS = 3;
/**
 * Payline visualization helper
 * Returns ASCII art of a payline on the grid
 */
export function visualizePayline(lineIndex) {
    const payline = PAYLINES[lineIndex];
    const grid = [
        ['.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.']
    ];
    for (let reel = 0; reel < NUM_REELS; reel++) {
        const row = payline[reel];
        grid[row][reel] = 'X';
    }
    return grid.map(row => row.join(' ')).join('\n');
}
/**
 * Get all grid positions covered by paylines
 * Returns Set of "row,col" strings
 */
export function getCoveredPositions() {
    const covered = new Set();
    for (const payline of PAYLINES) {
        for (let reel = 0; reel < NUM_REELS; reel++) {
            covered.add(`${payline[reel]},${reel}`);
        }
    }
    return covered;
}
/**
 * Validate payline definitions
 * Ensures all positions are within grid bounds
 */
export function validatePaylines() {
    for (let i = 0; i < PAYLINES.length; i++) {
        const payline = PAYLINES[i];
        if (payline.length !== NUM_REELS) {
            console.error(`Payline ${i + 1} has wrong length: ${payline.length}`);
            return false;
        }
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (payline[reel] < 0 || payline[reel] >= NUM_ROWS) {
                console.error(`Payline ${i + 1}, reel ${reel}: invalid row ${payline[reel]}`);
                return false;
            }
        }
    }
    return true;
}
//# sourceMappingURL=paylines.js.map