/**
 * REEL STRIPS TEMPLATE
 *
 * Kopiraj u reels.ts i prilagodi za svoju igru.
 *
 * KLJUČNE FORMULE:
 * - P(symbol in window) = (count / strip_length) × rows
 * - Za FS trigger ~1/117-140: staviti 2 scattera po rilu na 54-stop strip
 * - Za H&W trigger ~1/190-200: staviti 6-7 specijalnih po rilu
 */
import { SymbolId } from './symbols.js';
// ============================================
// SHORT ALIASES — Zameni svojim simbolima
// ============================================
// Low Pay
const L1 = SymbolId.LP_SYMBOL1;
const L2 = SymbolId.LP_SYMBOL2;
const L3 = SymbolId.LP_SYMBOL3;
const L4 = SymbolId.LP_SYMBOL4;
const L5 = SymbolId.LP_SYMBOL5;
// High Pay
const H1 = SymbolId.HP_SYMBOL1;
const H2 = SymbolId.HP_SYMBOL2;
const H3 = SymbolId.HP_SYMBOL3;
// Special
const WI = SymbolId.WILD;
const SC = SymbolId.SCATTER;
const SP = SymbolId.SPECIAL;
// ============================================
// BASE GAME REELS
// ============================================
/**
 * BASE GAME REEL STRIPS
 *
 * Guidelines per reel (54 stops, 5x3 grid):
 * - Scatters: 2 per reel → ~1/117-140 FS trigger
 * - Wilds: 2-3 per reel → ~5-8% wild presence
 * - HP symbols: 2-4 per reel (rarer = higher volatility)
 * - LP symbols: Fill remaining (~35-40)
 * - Special (H&W trigger): 6-7 per reel → ~1/190-200 trigger
 *
 * MATH VALIDATION:
 * - P(scatter in window) = 2/54 × 3 = 11.1%
 * - P(3+ scatters) ≈ C(5,3) × 0.111³ × 0.889² ≈ 1/117
 */
export const BASE_REELS = [
    // REEL 1 (54 stops)
    [
        H1, L1, L2, L3, L4, L5, // Hero symbol
        L1, L2, SP, L3, L4, L5, // Special 1
        L1, L2, L3, WI, L4, L5, // Wild 1
        L1, SC, L2, L3, L4, L5, // Scatter 1
        L1, H2, L2, SP, L3, L4, // HP2 + Special 2
        L5, L1, SP, L2, L3, L4, // Special 3
        L5, H3, L1, L2, WI, L3, // HP3 + Wild 2
        L4, SC, SP, L1, L2, L3, // Scatter 2 + Special 4
        L4, L5, SP, L1, WI, L2, // Special 5 + Wild 3
        L3, L4, SP, L5, H1, SP // Special 6 + Hero + Special 7
    ],
    // REEL 2 (54 stops) — Slična struktura
    [
        L1, H1, L2, L3, L4, L5,
        L1, L2, SP, L3, L4, L5,
        L1, L2, L3, WI, L4, L5,
        L1, SC, L2, L3, L4, L5,
        L1, H2, L2, SP, L3, L4,
        L5, L1, SP, L2, L3, L4,
        L5, H3, L1, L2, WI, L3,
        L4, SC, SP, L1, L2, L3,
        L4, L5, SP, L1, WI, L2,
        L3, L4, SP, L5, H1, SP
    ],
    // REEL 3 (54 stops) — CRITICAL MIDDLE
    [
        H1, L1, L2, L3, L4, L5,
        L1, L2, SP, L3, L4, L5,
        L1, L2, L3, WI, L4, L5,
        L1, SC, L2, L3, L4, L5,
        L1, H2, L2, SP, L3, L4,
        L5, L1, SP, L2, L3, L4,
        L5, H3, L1, L2, WI, L3,
        L4, SC, SP, L1, L2, L3,
        L4, L5, SP, L1, WI, L2,
        L3, L4, SP, L5, H1, SP
    ],
    // REEL 4 (54 stops)
    [
        L1, H1, L2, L3, L4, L5,
        L1, L2, SP, L3, L4, L5,
        L1, L2, L3, WI, L4, L5,
        L1, SC, L2, L3, L4, L5,
        L1, H2, L2, SP, L3, L4,
        L5, L1, SP, L2, L3, L4,
        L5, H3, L1, L2, WI, L3,
        L4, SC, SP, L1, L2, L3,
        L4, L5, SP, L1, WI, L2,
        L3, L4, SP, L5, H1, SP
    ],
    // REEL 5 (54 stops)
    [
        H1, L1, L2, L3, L4, L5,
        L1, L2, SP, L3, L4, L5,
        L1, L2, L3, WI, L4, L5,
        L1, SC, L2, L3, L4, L5,
        L1, H2, L2, SP, L3, L4,
        L5, L1, SP, L2, L3, L4,
        L5, H3, L1, L2, WI, L3,
        L4, SC, SP, L1, L2, L3,
        L4, L5, SP, L1, WI, L2,
        L3, L4, SP, L5, H1, SP
    ]
];
// ============================================
// FREE SPINS REELS (Modified)
// ============================================
/**
 * FREE SPINS REEL STRIPS
 *
 * Differences from base:
 * - MORE Wilds: 5-6 per reel (10-12%) → bigger wins
 * - LESS Specials: 4-5 per reel → H&W rarer in FS
 * - Same Scatters: 2 per reel → retrigger ~10-12%
 * - Shorter strips: 50 stops → higher symbol density
 */
export const FREE_SPINS_REELS = [
    // FS REEL 1 (50 stops)
    [
        H1, L1, L2, L3, WI, L4, // Hero + wild
        L5, L1, SP, L2, L3, L4, // Special 1
        L5, SC, L1, L2, L3, L4, // Scatter 1
        L5, L1, WI, L2, H2, L3, // Wild + HP2
        L4, L5, SP, L1, L2, L3, // Special 2
        H3, L4, WI, L5, L1, L2, // HP3 + wild
        L3, SC, SP, L5, L1, L2, // Scatter 2 + Special 3
        L3, L4, WI, L5, SP, L1, // Wild + special 4
        L2, L3, WI, SP // Wild + special 5
    ],
    // FS REEL 2 (50 stops)
    [
        L1, H1, L2, L3, WI, L4,
        L5, L1, SP, L2, L3, L4,
        L5, L1, SC, L2, L3, L4,
        L5, L1, WI, L2, H2, L3,
        L4, L5, SP, L1, L2, L3,
        L4, H3, WI, L5, L1, L2,
        L3, SC, SP, L5, L1, L2,
        L3, L4, WI, L5, SP, L1,
        L2, L3, WI, SP
    ],
    // FS REEL 3 (50 stops) — CRITICAL: Extra wild
    [
        H1, L1, WI, L2, L3, L4,
        L5, L1, SP, L2, WI, L3,
        L4, SC, L5, L1, L2, L3,
        L4, L5, WI, L1, H2, L2,
        L3, L4, SP, L5, L1, L2,
        H3, L3, WI, L4, L5, L1,
        L2, SC, SP, L4, L5, L1,
        L2, L3, WI, L4, SP, L5,
        L1, L2, SP
    ],
    // FS REEL 4 (50 stops)
    [
        L1, H1, L2, L3, WI, L4,
        L5, L1, SP, L2, L3, L4,
        L5, L1, SC, L2, L3, L4,
        L5, L1, WI, L2, H2, L3,
        L4, L5, SP, L1, L2, L3,
        L4, H3, WI, L5, L1, L2,
        L3, SC, SP, L5, L1, L2,
        L3, L4, WI, L5, SP, L1,
        L2, L3, WI, SP
    ],
    // FS REEL 5 (50 stops)
    [
        H1, L1, L2, L3, WI, L4,
        L5, L1, SP, L2, L3, L4,
        L5, SC, L1, L2, L3, L4,
        L5, L1, WI, L2, H2, L3,
        L4, L5, SP, L1, L2, L3,
        H3, L4, WI, L5, L1, L2,
        L3, SC, SP, L5, L1, L2,
        L3, L4, WI, L5, SP, L1,
        L2, L3, WI, SP
    ]
];
// ============================================
// HELPER FUNCTIONS
// ============================================
export function getReelLength(reelIndex, isFreeSpins = false) {
    const reels = isFreeSpins ? FREE_SPINS_REELS : BASE_REELS;
    return reels[reelIndex]?.length ?? 0;
}
export function getSymbolAtPosition(reelIndex, stopIndex, isFreeSpins = false) {
    const reels = isFreeSpins ? FREE_SPINS_REELS : BASE_REELS;
    const reel = reels[reelIndex];
    const wrappedIndex = ((stopIndex % reel.length) + reel.length) % reel.length;
    return reel[wrappedIndex];
}
export function getWindow(reelIndex, stopIndex, windowSize, isFreeSpins = false) {
    const window = [];
    for (let i = 0; i < windowSize; i++) {
        window.push(getSymbolAtPosition(reelIndex, stopIndex + i, isFreeSpins));
    }
    return window;
}
// ============================================
// VALIDATION
// ============================================
export function validateReelStrips() {
    const validateSet = (reels, name) => {
        for (let i = 0; i < reels.length; i++) {
            const reel = reels[i];
            if (reel.length < 30 || reel.length > 70) {
                console.warn(`${name} Reel ${i + 1}: Length ${reel.length} (expected 30-70)`);
            }
            // Check scatter count
            const scatterCount = reel.filter(s => s === SC).length;
            if (scatterCount !== 2) {
                console.warn(`${name} Reel ${i + 1}: Has ${scatterCount} scatters, expected 2`);
            }
            // Check wild count
            const wildCount = reel.filter(s => s === WI).length;
            console.log(`${name} Reel ${i + 1}: ${wildCount} wilds`);
        }
    };
    validateSet(BASE_REELS, 'Base');
    validateSet(FREE_SPINS_REELS, 'FS');
    return true;
}
// ============================================
// SYMBOL COUNT ANALYSIS
// ============================================
export function analyzeReelStrip(reels, name) {
    console.log(`\n=== ${name} Reel Analysis ===`);
    for (let i = 0; i < reels.length; i++) {
        const reel = reels[i];
        const counts = {};
        for (const symbol of reel) {
            counts[symbol] = (counts[symbol] || 0) + 1;
        }
        console.log(`\nReel ${i + 1} (${reel.length} stops):`);
        for (const [symbol, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
            const pct = ((count / reel.length) * 100).toFixed(1);
            console.log(`  ${symbol}: ${count} (${pct}%)`);
        }
    }
}
//# sourceMappingURL=reels.template.js.map