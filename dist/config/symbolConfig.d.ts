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
export interface SymbolRoles {
    wild: SymbolId;
    scatter: SymbolId;
    special: SymbolId | null;
    topPaying: SymbolId;
}
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
export declare const SYMBOL_ROLES: SymbolRoles;
/**
 * Check if symbol is wild
 */
export declare function isWild(symbol: SymbolId): boolean;
/**
 * Check if symbol is scatter
 */
export declare function isScatter(symbol: SymbolId): boolean;
/**
 * Check if symbol is special (H&W trigger)
 */
export declare function isSpecial(symbol: SymbolId): boolean;
/**
 * Check if symbol is a regular paying symbol
 * (not wild, scatter, or special)
 */
export declare function isPayingSymbol(symbol: SymbolId): boolean;
/**
 * Get wild symbol ID
 */
export declare function getWildSymbol(): SymbolId;
/**
 * Get scatter symbol ID
 */
export declare function getScatterSymbol(): SymbolId;
/**
 * Get special symbol ID (or null if no H&W)
 */
export declare function getSpecialSymbol(): SymbolId | null;
/**
 * Get top paying symbol (for wild-only lines)
 */
export declare function getTopPayingSymbol(): SymbolId;
export interface FeatureFlags {
    hasWild: boolean;
    hasScatter: boolean;
    hasFreeSpins: boolean;
    hasHoldAndWin: boolean;
    hasCollector: boolean;
    hasCascade: boolean;
    hasMultiplier: boolean;
}
/**
 * DEFAULT FEATURE FLAGS
 *
 * Postavi true/false za feature-e koje tvoja igra ima.
 */
export declare const FEATURE_FLAGS: FeatureFlags;
/**
 * Validate symbol config
 */
export declare function validateSymbolConfig(): boolean;
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
//# sourceMappingURL=symbolConfig.d.ts.map