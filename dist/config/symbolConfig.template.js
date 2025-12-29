/**
 * SYMBOL CONFIGURATION TEMPLATE
 *
 * Kopiraj u symbolConfig.ts i prilagodi za svoju igru.
 *
 * SVRHA:
 * - Centralni config za sve simbole
 * - Omogućava da core engine koristi generičke reference
 * - Umesto hardcoded simbola, engine koristi helper funkcije
 *
 * WORKFLOW:
 * 1. Definiši simbole u symbols.ts
 * 2. Popuni SYMBOL_ROLES ispod sa ID-jevima tvojih simbola
 * 3. Postavi FEATURE_FLAGS za feature-e koje tvoja igra ima
 * 4. Engine automatski koristi ove helper funkcije
 */
import { SymbolId } from '../model/symbols.js';
/**
 * SYMBOL ROLES CONFIG
 *
 * ═══════════════════════════════════════════════════════════
 * PROMENI OVO ZA SVOJU IGRU!
 * ═══════════════════════════════════════════════════════════
 *
 * PRIMERI:
 *
 * Greek mythology tema:
 *   wild: SymbolId.WILD_SHIELD,
 *   scatter: SymbolId.SCATTER_TEMPLE,
 *   special: SymbolId.LIGHTNING_ORB,
 *   topPaying: SymbolId.HP_ZEUS,
 *
 * Egyptian tema:
 *   wild: SymbolId.SCARAB_WILD,
 *   scatter: SymbolId.PYRAMID_SCATTER,
 *   special: SymbolId.ANKH_BONUS,
 *   topPaying: SymbolId.PHARAOH,
 *
 * Bez Hold & Win:
 *   wild: SymbolId.WILD,
 *   scatter: SymbolId.SCATTER,
 *   special: null,  // <-- null disables H&W detection
 *   topPaying: SymbolId.HP_SYMBOL3,
 */
export const SYMBOL_ROLES = {
    // Wild simbol
    wild: SymbolId.WILD,
    // Scatter (Free Spins trigger)
    scatter: SymbolId.SCATTER,
    // Special (Hold & Win trigger)
    // Postavi na null ako igra nema H&W feature
    special: SymbolId.SPECIAL,
    // Top paying simbol (koristi se za wild-only line wins)
    topPaying: SymbolId.HP_SYMBOL3,
};
// ============================================
// HELPER FUNCTIONS — Koriste se u engine-u
// ============================================
/**
 * Check if symbol is wild
 * Koristi ovo umesto hardcoded provere
 *
 * @example
 * // Umesto:
 * if (symbol === SymbolId.WILD_SHIELD) { ... }
 * // Koristi:
 * if (isWild(symbol)) { ... }
 */
export function isWild(symbol) {
    return symbol === SYMBOL_ROLES.wild;
}
/**
 * Check if symbol is scatter
 * @example
 * if (isScatter(symbol)) { ... }
 */
export function isScatter(symbol) {
    return symbol === SYMBOL_ROLES.scatter;
}
/**
 * Check if symbol is special (H&W trigger)
 * Returns false if special is null (H&W disabled)
 * @example
 * if (isSpecial(symbol)) { ... }
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
 * @example
 * const wildSymbol = getWildSymbol();
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
 * FEATURE FLAGS CONFIG
 *
 * Postavi true/false za feature-e koje tvoja igra ima.
 * Engine koristi ove flag-ove da zna koje sisteme da aktivira.
 */
export const FEATURE_FLAGS = {
    hasWild: true,
    hasScatter: true,
    hasFreeSpins: true,
    hasHoldAndWin: true, // Postavi false ako nema H&W
    hasCollector: false, // Postavi true ako ima collector bonus
    hasCascade: false, // Postavi true ako ima cascade/tumble
    hasMultiplier: true, // Progressive multiplier u FS
};
// ============================================
// VALIDATION
// ============================================
/**
 * Validate symbol config
 * Pozovi ovo pre simulacije da uhvatiš greške rano
 */
export function validateSymbolConfig() {
    const errors = [];
    // Check wild exists if enabled
    if (FEATURE_FLAGS.hasWild && !SYMBOL_ROLES.wild) {
        errors.push('Wild symbol not defined but hasWild is true');
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
        console.error('❌ Symbol config validation failed:');
        errors.forEach(e => console.error(`   - ${e}`));
        return false;
    }
    console.log('✅ Symbol config valid');
    return true;
}
// ============================================
// USAGE EXAMPLE
// ============================================
/**
 * KAKO KORISTITI U ENGINE-U:
 *
 * import { isWild, isScatter, getWildSymbol } from '../config/symbolConfig.js';
 *
 * // Provera wild-a:
 * if (isWild(symbol)) {
 *   // Handle wild logic
 * }
 *
 * // Provera scatter-a:
 * if (isScatter(symbol)) {
 *   scatterCount++;
 * }
 *
 * // Wild-only line win:
 * const wildSymbol = getWildSymbol();
 * const pay = PAYTABLE_LOOKUP.get(wildSymbol);
 *
 * // Feature guard:
 * if (FEATURE_FLAGS.hasHoldAndWin && isSpecial(symbol)) {
 *   // H&W logic
 * }
 */
//# sourceMappingURL=symbolConfig.template.js.map