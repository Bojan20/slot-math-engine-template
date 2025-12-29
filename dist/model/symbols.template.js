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
// ============================================
// SYMBOL IDS — Definiši sve simbole za svoju igru
// ============================================
export var SymbolId;
(function (SymbolId) {
    // ═══════════════════════════════════════════
    // LOW PAY SYMBOLS (5-7 simbola)
    // Česti simboli koji održavaju cadence igre
    // ═══════════════════════════════════════════
    SymbolId["LP_SYMBOL1"] = "LP_SYMBOL1";
    SymbolId["LP_SYMBOL2"] = "LP_SYMBOL2";
    SymbolId["LP_SYMBOL3"] = "LP_SYMBOL3";
    SymbolId["LP_SYMBOL4"] = "LP_SYMBOL4";
    SymbolId["LP_SYMBOL5"] = "LP_SYMBOL5";
    // ═══════════════════════════════════════════
    // HIGH PAY SYMBOLS (2-4 simbola)
    // Ređi simboli koji stvaraju excitement
    // ═══════════════════════════════════════════
    SymbolId["HP_SYMBOL1"] = "HP_SYMBOL1";
    SymbolId["HP_SYMBOL2"] = "HP_SYMBOL2";
    SymbolId["HP_SYMBOL3"] = "HP_SYMBOL3";
    // ═══════════════════════════════════════════
    // SPECIAL SYMBOLS
    // Wild, Scatter, Bonus simboli
    // ═══════════════════════════════════════════
    SymbolId["WILD"] = "WILD";
    SymbolId["SCATTER"] = "SCATTER";
    SymbolId["SPECIAL"] = "SPECIAL";
})(SymbolId || (SymbolId = {}));
// ============================================
// SYMBOL DEFINITIONS — Popuni za svaku igru
// ============================================
export const SYMBOL_DEFINITIONS = {
    // ═══════════════════════════════════════════
    // LOW PAY SYMBOLS
    // ═══════════════════════════════════════════
    [SymbolId.LP_SYMBOL1]: {
        id: SymbolId.LP_SYMBOL1,
        name: 'LP1', // Zameni imenom (npr. "10", "Ring")
        tier: 'LP',
        description: 'Lowest paying symbol',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_SYMBOL2]: {
        id: SymbolId.LP_SYMBOL2,
        name: 'LP2', // Zameni imenom (npr. "J", "Coin")
        tier: 'LP',
        description: 'Low pay symbol 2',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_SYMBOL3]: {
        id: SymbolId.LP_SYMBOL3,
        name: 'LP3', // Zameni imenom (npr. "Q", "Scroll")
        tier: 'LP',
        description: 'Low pay symbol 3',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_SYMBOL4]: {
        id: SymbolId.LP_SYMBOL4,
        name: 'LP4', // Zameni imenom (npr. "K", "Helmet")
        tier: 'LP',
        description: 'Low pay symbol 4',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_SYMBOL5]: {
        id: SymbolId.LP_SYMBOL5,
        name: 'LP5', // Zameni imenom (npr. "A", "Lyre")
        tier: 'LP',
        description: 'Highest low pay symbol',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    // ═══════════════════════════════════════════
    // HIGH PAY SYMBOLS
    // ═══════════════════════════════════════════
    [SymbolId.HP_SYMBOL1]: {
        id: SymbolId.HP_SYMBOL1,
        name: 'HP1', // Zameni imenom (npr. "Poseidon")
        tier: 'HP',
        description: 'Lowest high pay symbol',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.HP_SYMBOL2]: {
        id: SymbolId.HP_SYMBOL2,
        name: 'HP2', // Zameni imenom (npr. "Hades")
        tier: 'HP',
        description: 'Mid-tier high pay symbol',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.HP_SYMBOL3]: {
        id: SymbolId.HP_SYMBOL3,
        name: 'Hero', // Zameni imenom (npr. "Zeus", "Pharaoh")
        tier: 'HP',
        description: 'Top paying symbol (hero)',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    // ═══════════════════════════════════════════
    // SPECIAL SYMBOLS
    // ═══════════════════════════════════════════
    [SymbolId.WILD]: {
        id: SymbolId.WILD,
        name: 'Wild', // Zameni imenom (npr. "Wild Shield", "Scarab")
        tier: 'WILD',
        description: 'Substitutes all except Scatter and Special',
        substitutes: true,
        canBeSubstituted: false,
        appearsOnReels: [0, 1, 2, 3, 4] // Može biti ograničeno npr. [1, 2, 3]
    },
    [SymbolId.SCATTER]: {
        id: SymbolId.SCATTER,
        name: 'Scatter', // Zameni imenom (npr. "Temple", "Pyramid")
        tier: 'SCATTER',
        description: 'Triggers Free Spins, pays anywhere',
        substitutes: false,
        canBeSubstituted: false,
        appearsOnReels: [0, 1, 2, 3, 4] // Ili ograničeno [0, 2, 4]
    },
    [SymbolId.SPECIAL]: {
        id: SymbolId.SPECIAL,
        name: 'Special', // Zameni imenom (npr. "Lightning Orb", "Gold Coin")
        tier: 'SPECIAL',
        description: 'Hold & Win trigger, carries cash value',
        substitutes: false,
        canBeSubstituted: false,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
};
// ============================================
// HELPER ARRAYS — Koriste se u engine-u
// ============================================
/**
 * Low pay symbols array
 * Sortirano od najnižeg ka najvišem
 */
export const LP_SYMBOLS = [
    SymbolId.LP_SYMBOL1,
    SymbolId.LP_SYMBOL2,
    SymbolId.LP_SYMBOL3,
    SymbolId.LP_SYMBOL4,
    SymbolId.LP_SYMBOL5,
];
/**
 * High pay symbols array
 * Sortirano od najnižeg ka najvišem
 */
export const HP_SYMBOLS = [
    SymbolId.HP_SYMBOL1,
    SymbolId.HP_SYMBOL2,
    SymbolId.HP_SYMBOL3,
];
/**
 * All paying symbols (LP + HP)
 * Koristi se u evaluate.ts za win detection
 */
export const PAYING_SYMBOLS = [...LP_SYMBOLS, ...HP_SYMBOLS];
/**
 * All symbols
 */
export const ALL_SYMBOLS = Object.values(SymbolId);
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Check if wild can substitute for target symbol
 */
export function canSubstitute(wild, target) {
    const wildDef = SYMBOL_DEFINITIONS[wild];
    const targetDef = SYMBOL_DEFINITIONS[target];
    return wildDef?.substitutes && targetDef?.canBeSubstituted;
}
/**
 * Check if two symbols match (considering wild substitution)
 */
export function symbolsMatch(a, b) {
    if (a === b)
        return true;
    if (canSubstitute(a, b))
        return true;
    if (canSubstitute(b, a))
        return true;
    return false;
}
/**
 * Get symbol definition by ID
 */
export function getSymbolDefinition(id) {
    return SYMBOL_DEFINITIONS[id];
}
/**
 * Check if symbol is paying (LP or HP)
 */
export function isPayingSymbol(symbol) {
    return PAYING_SYMBOLS.includes(symbol);
}
//# sourceMappingURL=symbols.template.js.map