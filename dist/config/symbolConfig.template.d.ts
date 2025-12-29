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
export interface SymbolRoles {
    /**
     * Wild simbol koji substitutes za druge
     * Engine koristi isWild() za proveru
     */
    wild: SymbolId;
    /**
     * Scatter simbol koji triggeruje Free Spins
     * Engine koristi isScatter() za proveru
     */
    scatter: SymbolId;
    /**
     * Special simbol za Hold & Win (null ako igra nema H&W)
     * Engine koristi isSpecial() za proveru
     */
    special: SymbolId | null;
    /**
     * Highest paying simbol (za wild-only line wins)
     * Engine koristi ovo kada cela linija ima samo wild-ove
     */
    topPaying: SymbolId;
}
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
export declare const SYMBOL_ROLES: SymbolRoles;
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
export declare function isWild(symbol: SymbolId): boolean;
/**
 * Check if symbol is scatter
 * @example
 * if (isScatter(symbol)) { ... }
 */
export declare function isScatter(symbol: SymbolId): boolean;
/**
 * Check if symbol is special (H&W trigger)
 * Returns false if special is null (H&W disabled)
 * @example
 * if (isSpecial(symbol)) { ... }
 */
export declare function isSpecial(symbol: SymbolId): boolean;
/**
 * Check if symbol is a regular paying symbol
 * (not wild, scatter, or special)
 */
export declare function isPayingSymbol(symbol: SymbolId): boolean;
/**
 * Get wild symbol ID
 * @example
 * const wildSymbol = getWildSymbol();
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
    /** Ima li igra wild simbol */
    hasWild: boolean;
    /** Ima li igra scatter simbol */
    hasScatter: boolean;
    /** Ima li Free Spins feature */
    hasFreeSpins: boolean;
    /** Ima li Hold & Win feature */
    hasHoldAndWin: boolean;
    /** Ima li Collector bonus */
    hasCollector: boolean;
    /** Ima li Cascade/Tumble mehaniku */
    hasCascade: boolean;
    /** Ima li multiplier sistem */
    hasMultiplier: boolean;
}
/**
 * FEATURE FLAGS CONFIG
 *
 * Postavi true/false za feature-e koje tvoja igra ima.
 * Engine koristi ove flag-ove da zna koje sisteme da aktivira.
 */
export declare const FEATURE_FLAGS: FeatureFlags;
/**
 * Validate symbol config
 * Pozovi ovo pre simulacije da uhvatiš greške rano
 */
export declare function validateSymbolConfig(): boolean;
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
//# sourceMappingURL=symbolConfig.template.d.ts.map