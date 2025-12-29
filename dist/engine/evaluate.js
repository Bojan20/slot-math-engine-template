/**
 * SLOT MATH ENGINE TEMPLATE - Win Evaluation Engine
 *
 * Evaluates all wins from a spin:
 * - Line wins (L→R with wild substitution)
 * - Scatter wins (anywhere, 1 per reel max)
 * - Special symbol detection (for H&W trigger)
 * - Free spins trigger detection
 *
 * USES symbolConfig.ts for symbol role abstraction
 */
import { symbolsMatch, PAYING_SYMBOLS } from '../model/symbols.js';
import { PAYLINES, NUM_REELS } from '../model/paylines.js';
import { PAYTABLE_LOOKUP, getScatterResult } from '../model/paytable.js';
import { getSymbolAtPosition } from './spin.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { isWild, isScatter, isSpecial, getWildSymbol, FEATURE_FLAGS } from '../config/symbolConfig.js';
/**
 * Evaluate a single payline for wins
 * Returns best win (highest paying symbol match)
 */
function evaluatePayline(grid, payline, lineIndex) {
    // Get symbols on this payline
    const lineSymbols = [];
    const positions = [];
    for (let reel = 0; reel < NUM_REELS; reel++) {
        const row = payline[reel];
        lineSymbols.push(getSymbolAtPosition(grid, row, reel));
        positions.push({ row, reel });
    }
    // Find first non-wild symbol to determine base match
    let baseSymbol = null;
    let matchCount = 0;
    for (let reel = 0; reel < NUM_REELS; reel++) {
        const symbol = lineSymbols[reel];
        if (reel === 0) {
            // First reel must have a paying symbol (or wild)
            if (isWild(symbol)) {
                // Continue, wild can start
                continue;
            }
            else if (PAYING_SYMBOLS.includes(symbol)) {
                baseSymbol = symbol;
                matchCount = 1;
            }
            else {
                // Non-paying, non-wild on first reel = no win
                return null;
            }
        }
        else {
            // Check if symbol continues the match
            if (baseSymbol === null) {
                // Still looking for base (all wilds so far)
                if (isWild(symbol)) {
                    continue;
                }
                else if (PAYING_SYMBOLS.includes(symbol)) {
                    baseSymbol = symbol;
                    matchCount = reel + 1; // All previous were wilds
                }
                else {
                    // Non-paying symbol breaks
                    break;
                }
            }
            else {
                // We have a base symbol, check match
                if (symbolsMatch(symbol, baseSymbol)) {
                    matchCount++;
                }
                else {
                    break;
                }
            }
        }
    }
    // Handle all-wild line (pays as wild symbol)
    if (baseSymbol === null && matchCount === 0) {
        // Check if we had wilds
        let wildCount = 0;
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (isWild(lineSymbols[reel])) {
                wildCount++;
            }
            else {
                break;
            }
        }
        if (wildCount >= 3) {
            // All-wild line pays as wild symbol
            baseSymbol = getWildSymbol();
            matchCount = wildCount;
        }
    }
    // Must have at least 3 of a kind
    if (matchCount < 3 || baseSymbol === null) {
        return null;
    }
    // Get pay from paytable
    const pays = PAYTABLE_LOOKUP.get(baseSymbol);
    if (!pays)
        return null;
    const pay = matchCount === 3 ? pays[3] :
        matchCount === 4 ? pays[4] :
            matchCount === 5 ? pays[5] : 0;
    if (pay === 0)
        return null;
    return {
        lineIndex,
        symbol: baseSymbol,
        count: matchCount,
        pay,
        positions: positions.slice(0, matchCount)
    };
}
/**
 * Evaluate scatter symbols
 * Uses symbolConfig.isScatter() for symbol detection
 */
function evaluateScatters(grid) {
    const positions = [];
    // Find all scatter positions using symbolConfig helper
    for (let row = 0; row < grid.length; row++) {
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (isScatter(grid[row][reel])) {
                positions.push({ row, reel });
            }
        }
    }
    const count = positions.length;
    if (count < 3) {
        return null;
    }
    const scatterPay = getScatterResult(count);
    if (!scatterPay) {
        return null;
    }
    return {
        count,
        pay: scatterPay.pay,
        triggersFS: true,
        freeSpinsAwarded: scatterPay.freeSpinsAwarded,
        positions
    };
}
/**
 * Evaluate Special symbols (for H&W trigger)
 * Uses symbolConfig.isSpecial() for symbol detection
 */
function evaluateSpecialSymbols(grid) {
    // Skip if H&W not enabled
    if (!FEATURE_FLAGS.hasHoldAndWin) {
        return null;
    }
    const positions = [];
    // Special symbols can appear anywhere on the grid
    for (let row = 0; row < grid.length; row++) {
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (isSpecial(grid[row][reel])) {
                positions.push({ row, reel });
            }
        }
    }
    if (positions.length === 0) {
        return null;
    }
    const triggersHnW = positions.length >= GAME_CONFIG.holdAndWin.triggerOrbCount;
    return {
        count: positions.length,
        triggersHnW,
        positions
    };
}
// Backwards compatibility alias
function evaluateLightningOrbs(grid) {
    return evaluateSpecialSymbols(grid);
}
/**
 * Full evaluation of a spin
 */
export function evaluate(grid, _rng, // Kept for API compatibility, not used in v7
fsGlobalMultiplier = 1) {
    // Evaluate all paylines
    const lineWins = [];
    let lineWinTotal = 0;
    for (let i = 0; i < PAYLINES.length; i++) {
        const win = evaluatePayline(grid, PAYLINES[i], i);
        if (win) {
            lineWins.push(win);
            lineWinTotal += win.pay;
        }
    }
    // Evaluate scatters
    const scatterResult = evaluateScatters(grid);
    const scatterWin = scatterResult?.pay ?? 0;
    // Evaluate Special symbols (H&W trigger detection)
    const specialSymbolResult = evaluateSpecialSymbols(grid);
    // Backwards compatibility alias
    const lightningOrbResult = specialSymbolResult;
    // Calculate totals (no orb multiplier in v7 - orbs are for H&W)
    const baseWin = lineWinTotal + scatterWin;
    // Only FS global multiplier applies in v7
    const totalMultiplier = fsGlobalMultiplier;
    // Final win with multiplier
    let totalWin = baseWin * totalMultiplier;
    // Apply win cap
    if (totalWin > GAME_CONFIG.caps.maxWinMultiplier) {
        totalWin = GAME_CONFIG.caps.maxWinMultiplier;
    }
    return {
        lineWins,
        lineWinTotal,
        scatterResult,
        scatterWin,
        specialSymbolResult,
        lightningOrbResult, // Backwards compatibility
        baseWin,
        multiplier: totalMultiplier,
        totalWin,
        triggeredFS: scatterResult?.triggersFS ?? false,
        freeSpinsAwarded: scatterResult?.freeSpinsAwarded ?? 0,
        triggeredHnW: specialSymbolResult?.triggersHnW ?? false
    };
}
/**
 * Quick check if grid has any win (for stats)
 * Uses symbolConfig helpers for symbol detection
 */
export function hasAnyWin(grid) {
    // Check line wins
    for (const payline of PAYLINES) {
        const lineSymbols = [];
        for (let reel = 0; reel < NUM_REELS; reel++) {
            lineSymbols.push(grid[payline[reel]][reel]);
        }
        let matchCount = 0;
        let baseSymbol = null;
        for (let reel = 0; reel < NUM_REELS; reel++) {
            const symbol = lineSymbols[reel];
            if (reel === 0) {
                if (isWild(symbol) || PAYING_SYMBOLS.includes(symbol)) {
                    if (!isWild(symbol))
                        baseSymbol = symbol;
                    matchCount = 1;
                }
                else
                    break;
            }
            else {
                if (baseSymbol === null) {
                    if (isWild(symbol)) {
                        matchCount++;
                    }
                    else if (PAYING_SYMBOLS.includes(symbol)) {
                        baseSymbol = symbol;
                        matchCount++;
                    }
                    else
                        break;
                }
                else {
                    if (symbolsMatch(symbol, baseSymbol)) {
                        matchCount++;
                    }
                    else
                        break;
                }
            }
        }
        if (matchCount >= 3)
            return true;
    }
    // Check scatter (3+ triggers FS and pays)
    let scatterCount = 0;
    for (let row = 0; row < grid.length; row++) {
        for (let reel = 0; reel < NUM_REELS; reel++) {
            if (isScatter(grid[row][reel])) {
                scatterCount++;
            }
        }
    }
    if (scatterCount >= 3)
        return true;
    // Check Special symbols (H&W trigger)
    if (FEATURE_FLAGS.hasHoldAndWin) {
        let specialCount = 0;
        for (let row = 0; row < grid.length; row++) {
            for (let reel = 0; reel < NUM_REELS; reel++) {
                if (isSpecial(grid[row][reel])) {
                    specialCount++;
                }
            }
        }
        if (specialCount >= GAME_CONFIG.holdAndWin.triggerOrbCount)
            return true;
    }
    return false;
}
//# sourceMappingURL=evaluate.js.map