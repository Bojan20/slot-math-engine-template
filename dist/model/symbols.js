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
export var SymbolId;
(function (SymbolId) {
    // Low Pay Symbols (LP) - Theme artifacts/items
    SymbolId["LP_LYRE"] = "LP_LYRE";
    SymbolId["LP_COIN"] = "LP_COIN";
    SymbolId["LP_HELMET"] = "LP_HELMET";
    SymbolId["LP_SCROLL"] = "LP_SCROLL";
    SymbolId["LP_RING"] = "LP_RING";
    // High Pay Symbols (HP) - Theme characters
    SymbolId["HP_ZEUS"] = "HP_ZEUS";
    SymbolId["HP_HADES"] = "HP_HADES";
    SymbolId["HP_POSEIDON"] = "HP_POSEIDON";
    // Special Symbols
    SymbolId["WILD_SHIELD"] = "WILD_SHIELD";
    SymbolId["SCATTER_TEMPLE"] = "SCATTER_TEMPLE";
    SymbolId["LIGHTNING_ORB"] = "LIGHTNING_ORB"; // Special - Hold & Win trigger + cash values
})(SymbolId || (SymbolId = {}));
export const SYMBOL_DEFINITIONS = {
    // Low Pay Symbols
    [SymbolId.LP_LYRE]: {
        id: SymbolId.LP_LYRE,
        name: 'LP1',
        tier: 'LP',
        description: 'Low pay symbol 1',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_COIN]: {
        id: SymbolId.LP_COIN,
        name: 'LP2',
        tier: 'LP',
        description: 'Low pay symbol 2',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_HELMET]: {
        id: SymbolId.LP_HELMET,
        name: 'LP3',
        tier: 'LP',
        description: 'Low pay symbol 3',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_SCROLL]: {
        id: SymbolId.LP_SCROLL,
        name: 'LP4',
        tier: 'LP',
        description: 'Low pay symbol 4',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LP_RING]: {
        id: SymbolId.LP_RING,
        name: 'LP5',
        tier: 'LP',
        description: 'Low pay symbol 5',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    // High Pay Symbols
    [SymbolId.HP_ZEUS]: {
        id: SymbolId.HP_ZEUS,
        name: 'Hero',
        tier: 'HP',
        description: 'Top paying symbol',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.HP_HADES]: {
        id: SymbolId.HP_HADES,
        name: 'HP2',
        tier: 'HP',
        description: 'High pay symbol 2',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.HP_POSEIDON]: {
        id: SymbolId.HP_POSEIDON,
        name: 'HP3',
        tier: 'HP',
        description: 'High pay symbol 3',
        substitutes: false,
        canBeSubstituted: true,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    // Special Symbols
    [SymbolId.WILD_SHIELD]: {
        id: SymbolId.WILD_SHIELD,
        name: 'Wild',
        tier: 'WILD',
        description: 'Substitutes all except Scatter & Special',
        substitutes: true,
        canBeSubstituted: false,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.SCATTER_TEMPLE]: {
        id: SymbolId.SCATTER_TEMPLE,
        name: 'Scatter',
        tier: 'SCATTER',
        description: 'Triggers Free Spins, pays anywhere',
        substitutes: false,
        canBeSubstituted: false,
        appearsOnReels: [0, 1, 2, 3, 4]
    },
    [SymbolId.LIGHTNING_ORB]: {
        id: SymbolId.LIGHTNING_ORB,
        name: 'Special',
        tier: 'SPECIAL',
        description: 'Hold & Win trigger, carries cash value',
        substitutes: false,
        canBeSubstituted: false,
        appearsOnReels: [0, 1, 2, 3, 4]
    }
};
// Helper arrays for quick lookups
export const LP_SYMBOLS = [
    SymbolId.LP_LYRE,
    SymbolId.LP_COIN,
    SymbolId.LP_HELMET,
    SymbolId.LP_SCROLL,
    SymbolId.LP_RING
];
export const HP_SYMBOLS = [
    SymbolId.HP_ZEUS,
    SymbolId.HP_HADES,
    SymbolId.HP_POSEIDON
];
export const PAYING_SYMBOLS = [...LP_SYMBOLS, ...HP_SYMBOLS];
export const ALL_SYMBOLS = Object.values(SymbolId);
/**
 * Check if a symbol can substitute for another
 */
export function canSubstitute(substitutor, target) {
    const substitutorDef = SYMBOL_DEFINITIONS[substitutor];
    const targetDef = SYMBOL_DEFINITIONS[target];
    return substitutorDef.substitutes && targetDef.canBeSubstituted;
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
//# sourceMappingURL=symbols.js.map