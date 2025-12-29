/**
 * PAYTABLE TEMPLATE
 *
 * Kopiraj u paytable.ts i prilagodi vrednosti.
 *
 * SVE VREDNOSTI SU x TOTAL BET (ne line bet!)
 */
import { SymbolId } from './symbols.js';
/**
 * LINE PAYS
 *
 * Vodič za vrednosti (96% RTP, medium volatility):
 *
 * | Tier    | 3oak      | 4oak     | 5oak      |
 * |---------|-----------|----------|-----------|
 * | LP-Low  | 0.4-0.6x  | 1.5-2x   | 4-6x      |
 * | LP-Mid  | 0.6-0.9x  | 2-3x     | 6-9x      |
 * | HP-Low  | 1.5-2x    | 5-8x     | 25-40x    |
 * | HP-Mid  | 2-2.5x    | 8-12x    | 40-50x    |
 * | HP-Top  | 2.5-3.5x  | 10-15x   | 50-70x    |
 * | Wild    | =HP-Top   | =HP-Top  | =HP-Top   |
 */
export const LINE_PAYTABLE = [
    // ========== LOW PAY ==========
    {
        symbol: SymbolId.LP_SYMBOL1, // Najniži
        pays: { 3: 0.4, 4: 1.5, 5: 4.0 }
    },
    {
        symbol: SymbolId.LP_SYMBOL2,
        pays: { 3: 0.5, 4: 1.8, 5: 5.0 }
    },
    {
        symbol: SymbolId.LP_SYMBOL3,
        pays: { 3: 0.6, 4: 2.0, 5: 6.0 }
    },
    {
        symbol: SymbolId.LP_SYMBOL4,
        pays: { 3: 0.8, 4: 2.5, 5: 8.0 }
    },
    {
        symbol: SymbolId.LP_SYMBOL5, // Najviši LP
        pays: { 3: 0.9, 4: 3.0, 5: 9.0 }
    },
    // ========== HIGH PAY ==========
    {
        symbol: SymbolId.HP_SYMBOL1, // Najniži HP
        pays: { 3: 2.0, 4: 7.0, 5: 35.0 }
    },
    {
        symbol: SymbolId.HP_SYMBOL2,
        pays: { 3: 2.5, 4: 10.0, 5: 50.0 }
    },
    {
        symbol: SymbolId.HP_SYMBOL3, // Hero - najviši
        pays: { 3: 3.0, 4: 12.0, 5: 60.0 }
    },
    // ========== WILD ==========
    {
        symbol: SymbolId.WILD, // Plaća kao hero
        pays: { 3: 3.0, 4: 12.0, 5: 60.0 }
    }
];
/**
 * SCATTER PAYS
 *
 * Scatter plaća anywhere (ne mora biti na payline)
 * Plus triggeruje Free Spins
 */
export const SCATTER_PAYTABLE = [
    { count: 3, pay: 2.0, freeSpinsAwarded: 8 },
    { count: 4, pay: 10.0, freeSpinsAwarded: 12 },
    { count: 5, pay: 50.0, freeSpinsAwarded: 15 }
];
// ============================================
// HELPER FUNCTIONS
// ============================================
export function getLinePay(symbol, count) {
    const entry = LINE_PAYTABLE.find(p => p.symbol === symbol);
    if (!entry)
        return 0;
    if (count === 3)
        return entry.pays[3];
    if (count === 4)
        return entry.pays[4];
    if (count === 5)
        return entry.pays[5];
    return 0;
}
export function getScatterResult(count) {
    return SCATTER_PAYTABLE.find(s => s.count === count) || null;
}
export function buildPaytableLookup() {
    const lookup = new Map();
    for (const entry of LINE_PAYTABLE) {
        lookup.set(entry.symbol, entry.pays);
    }
    return lookup;
}
export const PAYTABLE_LOOKUP = buildPaytableLookup();
//# sourceMappingURL=paytable.template.js.map