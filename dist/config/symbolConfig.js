/**
 * SLOT MATH ENGINE TEMPLATE - Symbol Configuration
 *
 * Central config for all symbol roles.
 * This enables the core engine to use generic references
 * instead of hardcoded theme-specific symbols.
 *
 * CUSTOMIZATION:
 * 1. Define your symbols in symbols.ts
 * 2. Update SYMBOL_ROLES with your symbol IDs
 * 3. Engine uses this config for evaluation
 */
import { SymbolId } from '../model/symbols.js';
/**
 * DEFAULT SYMBOL ROLES
 *
 * PROMENI OVO ZA SVOJU IGRU!
 *
 * Primer za Egyptian temu:
 * wild: SymbolId.SCARAB_WILD,
 * scatter: SymbolId.PYRAMID_SCATTER,
 * special: SymbolId.ANKH_BONUS,
 * topPaying: SymbolId.PHARAOH,
 */
export const SYMBOL_ROLES = {
    // Wild simbol
    wild: SymbolId.WILD_SHIELD,
    // Scatter (Free Spins trigger)
    scatter: SymbolId.SCATTER_TEMPLE,
    // Special (Hold & Win trigger) — postavi na null ako nema H&W
    special: SymbolId.LIGHTNING_ORB,
    // Top paying simbol (koristi se za wild-only wins)
    topPaying: SymbolId.HP_ZEUS,
};
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Check if symbol is wild
 */
export function isWild(symbol) {
    return symbol === SYMBOL_ROLES.wild;
}
/**
 * Check if symbol is scatter
 */
export function isScatter(symbol) {
    return symbol === SYMBOL_ROLES.scatter;
}
/**
 * Check if symbol is special (H&W trigger)
 */
export function isSpecial(symbol) {
    return SYMBOL_ROLES.special !== null && symbol === SYMBOL_ROLES.special;
}
/**
 * Check if symbol is a regular paying symbol
 * (not wild, scatter, or special)
 */
export function isPayingSymbol(symbol) {
    return !isWild(symbol) && !isScatter(symbol) && !isSpecial(symbol);
}
/**
 * Get wild symbol ID
 */
export function getWildSymbol() {
    return SYMBOL_ROLES.wild;
}
/**
 * Get scatter symbol ID
 */
export function getScatterSymbol() {
    return SYMBOL_ROLES.scatter;
}
/**
 * Get special symbol ID (or null if no H&W)
 */
export function getSpecialSymbol() {
    return SYMBOL_ROLES.special;
}
/**
 * Get top paying symbol (for wild-only lines)
 */
export function getTopPayingSymbol() {
    return SYMBOL_ROLES.topPaying;
}
/**
 * DEFAULT FEATURE FLAGS
 *
 * Postavi true/false za feature-e koje tvoja igra ima.
 */
export const FEATURE_FLAGS = {
    hasWild: true,
    hasScatter: true,
    hasFreeSpins: true,
    hasHoldAndWin: true, // Postavi false ako nema H&W
    hasCollector: false,
    hasCascade: false,
    hasMultiplier: true, // Progressive multiplier u FS
};
// ============================================
// VALIDATION
// ============================================
/**
 * Validate symbol config
 */
export function validateSymbolConfig() {
    const errors = [];
    // Check wild exists
    if (!SYMBOL_ROLES.wild) {
        errors.push('Wild symbol not defined');
    }
    // Check scatter exists if FS enabled
    if (FEATURE_FLAGS.hasFreeSpins && !SYMBOL_ROLES.scatter) {
        errors.push('Scatter symbol required for Free Spins');
    }
    // Check special exists if H&W enabled
    if (FEATURE_FLAGS.hasHoldAndWin && !SYMBOL_ROLES.special) {
        errors.push('Special symbol required for Hold & Win');
    }
    // Check top paying exists
    if (!SYMBOL_ROLES.topPaying) {
        errors.push('Top paying symbol not defined');
    }
    if (errors.length > 0) {
        console.error('Symbol config validation failed:');
        errors.forEach(e => console.error(`  - ${e}`));
        return false;
    }
    return true;
}
// ============================================
// USAGE EXAMPLE
// ============================================
/**
 * Primer korišćenja u evaluate.ts:
 *
 * import { isWild, isScatter, getWildSymbol } from '../config/symbolConfig.js';
 *
 * // Umesto:
 * if (symbol === SymbolId.WILD_SHIELD) { ... }
 *
 * // Koristi:
 * if (isWild(symbol)) { ... }
 *
 * // Za wild-only linije:
 * const wildSymbol = getWildSymbol();
 */
//# sourceMappingURL=symbolConfig.js.map