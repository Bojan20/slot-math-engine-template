/**
 * SYMBOLS TEMPLATE
 *
 * Kopiraj u symbols.ts i prilagodi za svoju igru.
 *
 * WORKFLOW:
 * 1. Definiši svoje simbole u SymbolId enum
 * 2. Popuni SYMBOL_DEFINITIONS za svaki simbol
 * 3. Ažuriraj helper arrays (LP_SYMBOLS, HP_SYMBOLS)
 * 4. Ažuriraj symbolConfig.ts sa SYMBOL_ROLES
 */
export declare enum SymbolId {
    LP_SYMBOL1 = "LP_SYMBOL1",// Najniži LP (npr. 10, Ring)
    LP_SYMBOL2 = "LP_SYMBOL2",// (npr. J, Coin)
    LP_SYMBOL3 = "LP_SYMBOL3",// (npr. Q, Scroll)
    LP_SYMBOL4 = "LP_SYMBOL4",// (npr. K, Helmet)
    LP_SYMBOL5 = "LP_SYMBOL5",// Najviši LP (npr. A, Lyre)
    HP_SYMBOL1 = "HP_SYMBOL1",// Najniži HP (npr. Poseidon)
    HP_SYMBOL2 = "HP_SYMBOL2",// Srednji HP (npr. Hades)
    HP_SYMBOL3 = "HP_SYMBOL3",// Najviši HP / Hero (npr. Zeus)
    WILD = "WILD",// Wild - substitutes all except scatter/special
    SCATTER = "SCATTER",// Scatter - triggers Free Spins
    SPECIAL = "SPECIAL"
}
export type SymbolTier = 'LP' | 'HP' | 'WILD' | 'SCATTER' | 'SPECIAL';
export interface SymbolDefinition {
    id: SymbolId;
    name: string;
    tier: SymbolTier;
    description: string;
    substitutes: boolean;
    canBeSubstituted: boolean;
    appearsOnReels: number[];
}
export declare const SYMBOL_DEFINITIONS: Record<SymbolId, SymbolDefinition>;
/**
 * Low pay symbols array
 * Sortirano od najnižeg ka najvišem
 */
export declare const LP_SYMBOLS: SymbolId[];
/**
 * High pay symbols array
 * Sortirano od najnižeg ka najvišem
 */
export declare const HP_SYMBOLS: SymbolId[];
/**
 * All paying symbols (LP + HP)
 * Koristi se u evaluate.ts za win detection
 */
export declare const PAYING_SYMBOLS: SymbolId[];
/**
 * All symbols
 */
export declare const ALL_SYMBOLS: SymbolId[];
/**
 * Check if wild can substitute for target symbol
 */
export declare function canSubstitute(wild: SymbolId, target: SymbolId): boolean;
/**
 * Check if two symbols match (considering wild substitution)
 */
export declare function symbolsMatch(a: SymbolId, b: SymbolId): boolean;
/**
 * Get symbol definition by ID
 */
export declare function getSymbolDefinition(id: SymbolId): SymbolDefinition;
/**
 * Check if symbol is paying (LP or HP)
 */
export declare function isPayingSymbol(symbol: SymbolId): boolean;
//# sourceMappingURL=symbols.template.d.ts.map