/**
 * SLOT MATH ENGINE TEMPLATE - Symbol Definitions
 *
 * Symbol economy design:
 * - 5 Low Pay (LP): Sustain cadence, frequent small wins
 * - 3 High Pay (HP): Excitement drivers, rarer but impactful
 * - 3 Special: Wild, Scatter, Special (H&W trigger)
 *
 * Total: 11 unique symbols
 *
 * CUSTOMIZATION:
 * 1. Rename symbols in SymbolId enum to match your theme
 * 2. Update SYMBOL_DEFINITIONS with your symbol names
 * 3. Update symbolConfig.ts SYMBOL_ROLES
 * 4. Update paytable.ts and reels.ts accordingly
 */
export declare enum SymbolId {
    LP_LYRE = "LP_LYRE",// Rename for your theme (e.g., LP_10, LP_ANKH)
    LP_COIN = "LP_COIN",// Rename for your theme (e.g., LP_J, LP_SCARAB)
    LP_HELMET = "LP_HELMET",// Rename for your theme (e.g., LP_Q, LP_EYE)
    LP_SCROLL = "LP_SCROLL",// Rename for your theme (e.g., LP_K, LP_STAFF)
    LP_RING = "LP_RING",// Rename for your theme (e.g., LP_A, LP_BIRD)
    HP_ZEUS = "HP_ZEUS",// Rename for your theme (e.g., HP_PHARAOH)
    HP_HADES = "HP_HADES",// Rename for your theme (e.g., HP_ANUBIS)
    HP_POSEIDON = "HP_POSEIDON",// Rename for your theme (e.g., HP_CLEOPATRA)
    WILD_SHIELD = "WILD_SHIELD",// Wild - substitutes all except Scatter & Special
    SCATTER_TEMPLE = "SCATTER_TEMPLE",// Scatter - triggers Free Spins
    LIGHTNING_ORB = "LIGHTNING_ORB"
}
export interface SymbolDefinition {
    id: SymbolId;
    name: string;
    tier: 'LP' | 'HP' | 'WILD' | 'SCATTER' | 'SPECIAL';
    description: string;
    substitutes: boolean;
    canBeSubstituted: boolean;
    appearsOnReels: number[];
}
export declare const SYMBOL_DEFINITIONS: Record<SymbolId, SymbolDefinition>;
export declare const LP_SYMBOLS: SymbolId[];
export declare const HP_SYMBOLS: SymbolId[];
export declare const PAYING_SYMBOLS: SymbolId[];
export declare const ALL_SYMBOLS: SymbolId[];
/**
 * Check if a symbol can substitute for another
 */
export declare function canSubstitute(substitutor: SymbolId, target: SymbolId): boolean;
/**
 * Check if two symbols match (considering wild substitution)
 */
export declare function symbolsMatch(a: SymbolId, b: SymbolId): boolean;
//# sourceMappingURL=symbols.d.ts.map