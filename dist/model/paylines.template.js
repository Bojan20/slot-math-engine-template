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
// ============================================
// GRID CONFIGURATION
// ============================================
export const NUM_REELS = 5;
export const NUM_ROWS = 3;
// ============================================
// 10 PAYLINES (Classic)
// ============================================
export const PAYLINES_10 = [
    [1, 1, 1, 1, 1], // Line 1: Middle straight
    [0, 0, 0, 0, 0], // Line 2: Top straight
    [2, 2, 2, 2, 2], // Line 3: Bottom straight
    [0, 1, 2, 1, 0], // Line 4: V shape
    [2, 1, 0, 1, 2], // Line 5: Inverted V
    [0, 0, 1, 2, 2], // Line 6: Top zigzag down
    [2, 2, 1, 0, 0], // Line 7: Bottom zigzag up
    [1, 0, 0, 0, 1], // Line 8: Wave down
    [1, 2, 2, 2, 1], // Line 9: Wave up
    [1, 0, 1, 2, 1], // Line 10: Diamond
];
// ============================================
// 20 PAYLINES (Standard)
// ============================================
export const PAYLINES_20 = [
    // Basic 10
    [1, 1, 1, 1, 1], // 1: Middle
    [0, 0, 0, 0, 0], // 2: Top
    [2, 2, 2, 2, 2], // 3: Bottom
    [0, 1, 2, 1, 0], // 4: V
    [2, 1, 0, 1, 2], // 5: Inverted V
    [0, 0, 1, 2, 2], // 6: Diagonal down
    [2, 2, 1, 0, 0], // 7: Diagonal up
    [1, 0, 0, 0, 1], // 8: Wave down
    [1, 2, 2, 2, 1], // 9: Wave up
    [1, 0, 1, 2, 1], // 10: Diamond down
    // Extended 10
    [1, 2, 1, 0, 1], // 11: Diamond up
    [0, 1, 1, 1, 0], // 12: Shallow V
    [2, 1, 1, 1, 2], // 13: Shallow inverted V
    [0, 1, 0, 1, 0], // 14: Top zigzag
    [2, 1, 2, 1, 2], // 15: Bottom zigzag
    [1, 1, 0, 1, 1], // 16: Bump up
    [1, 1, 2, 1, 1], // 17: Bump down
    [0, 2, 0, 2, 0], // 18: Wide zigzag top
    [2, 0, 2, 0, 2], // 19: Wide zigzag bottom
    [0, 2, 1, 2, 0], // 20: Deep V
];
// ============================================
// WAYS PAYS (Alternative to paylines)
// ============================================
/**
 * 243 Ways = 3^5
 * Any symbol on adjacent reels from left wins
 * No specific payline patterns needed
 */
export const WAYS_243 = {
    type: 'ways',
    rows: 3,
    reels: 5,
    totalWays: 243, // 3 × 3 × 3 × 3 × 3
};
/**
 * 1024 Ways = 4^5
 * For 4-row games
 */
export const WAYS_1024 = {
    type: 'ways',
    rows: 4,
    reels: 5,
    totalWays: 1024, // 4 × 4 × 4 × 4 × 4
};
// ============================================
// ACTIVE CONFIGURATION — IZABERI JEDAN
// ============================================
// Option A: Fixed paylines
export const PAYLINES = PAYLINES_20; // Zameni sa PAYLINES_10 ako treba
export const NUM_PAYLINES = PAYLINES.length;
// Option B: Ways pays (odkomentariši ako koristiš)
// export const PAY_SYSTEM = WAYS_243;
// ============================================
// HELPER FUNCTIONS
// ============================================
export function visualizePayline(lineIndex) {
    const payline = PAYLINES[lineIndex];
    const grid = Array(NUM_ROWS).fill(null).map(() => Array(NUM_REELS).fill('.'));
    for (let reel = 0; reel < NUM_REELS; reel++) {
        const row = payline[reel];
        grid[row][reel] = 'X';
    }
    return `Line ${lineIndex + 1}:\n` + grid.map(row => row.join(' ')).join('\n');
}
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
/**
 * Calculate ways multiplier for a win
 * Used for ways-pays games
 */
export function calculateWaysMultiplier(symbolCountsPerReel) {
    return symbolCountsPerReel.reduce((mult, count) => mult * count, 1);
}
//# sourceMappingURL=paylines.template.js.map