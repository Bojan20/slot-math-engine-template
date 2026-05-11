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

export enum SymbolId {
  // Low Pay Symbols (LP) - Theme artifacts/items
  LP_1 = 'LP_1',       // e.g., 10, J, Ankh, Lyre
  LP_2 = 'LP_2',       // e.g., J, Q, Scarab, Coin
  LP_3 = 'LP_3',       // e.g., Q, K, Eye, Helmet
  LP_4 = 'LP_4',       // e.g., K, A, Staff, Scroll
  LP_5 = 'LP_5',       // e.g., A, Bird, Ring

  // High Pay Symbols (HP) - Theme characters
  HP_1 = 'HP_1',       // Top paying (e.g., Pharaoh, Zeus, Dragon)
  HP_2 = 'HP_2',       // Second (e.g., Anubis, Hades, Tiger)
  HP_3 = 'HP_3',       // Third (e.g., Cleopatra, Poseidon, Phoenix)

  // Special Symbols
  WILD = 'WILD',       // Wild - substitutes all except Scatter & Special
  SCATTER = 'SCATTER', // Scatter - triggers Free Spins
  BONUS = 'BONUS'      // Special - Hold & Win trigger + cash values
}

export interface SymbolDefinition {
  id: SymbolId;
  name: string;
  tier: 'LP' | 'HP' | 'WILD' | 'SCATTER' | 'SPECIAL';
  description: string;
  substitutes: boolean;        // Can substitute for other symbols
  canBeSubstituted: boolean;   // Can be substituted by Wild
  appearsOnReels: number[];    // Which reels (0-4) this symbol can appear on
}

export const SYMBOL_DEFINITIONS: Record<SymbolId, SymbolDefinition> = {
  // Low Pay Symbols
  [SymbolId.LP_1]: {
    id: SymbolId.LP_1,
    name: 'LP1',
    tier: 'LP',
    description: 'Low pay symbol 1',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.LP_2]: {
    id: SymbolId.LP_2,
    name: 'LP2',
    tier: 'LP',
    description: 'Low pay symbol 2',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.LP_3]: {
    id: SymbolId.LP_3,
    name: 'LP3',
    tier: 'LP',
    description: 'Low pay symbol 3',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.LP_4]: {
    id: SymbolId.LP_4,
    name: 'LP4',
    tier: 'LP',
    description: 'Low pay symbol 4',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.LP_5]: {
    id: SymbolId.LP_5,
    name: 'LP5',
    tier: 'LP',
    description: 'Low pay symbol 5',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },

  // High Pay Symbols
  [SymbolId.HP_1]: {
    id: SymbolId.HP_1,
    name: 'HP1',
    tier: 'HP',
    description: 'Top paying symbol',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.HP_2]: {
    id: SymbolId.HP_2,
    name: 'HP2',
    tier: 'HP',
    description: 'High pay symbol 2',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.HP_3]: {
    id: SymbolId.HP_3,
    name: 'HP3',
    tier: 'HP',
    description: 'High pay symbol 3',
    substitutes: false,
    canBeSubstituted: true,
    appearsOnReels: [0, 1, 2, 3, 4]
  },

  // Special Symbols
  [SymbolId.WILD]: {
    id: SymbolId.WILD,
    name: 'Wild',
    tier: 'WILD',
    description: 'Substitutes all except Scatter & Special',
    substitutes: true,
    canBeSubstituted: false,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.SCATTER]: {
    id: SymbolId.SCATTER,
    name: 'Scatter',
    tier: 'SCATTER',
    description: 'Triggers Free Spins, pays anywhere',
    substitutes: false,
    canBeSubstituted: false,
    appearsOnReels: [0, 1, 2, 3, 4]
  },
  [SymbolId.BONUS]: {
    id: SymbolId.BONUS,
    name: 'Bonus',
    tier: 'SPECIAL',
    description: 'Hold & Win trigger, carries cash value',
    substitutes: false,
    canBeSubstituted: false,
    appearsOnReels: [0, 1, 2, 3, 4]
  }
};

// Helper arrays for quick lookups
export const LP_SYMBOLS: SymbolId[] = [
  SymbolId.LP_1,
  SymbolId.LP_2,
  SymbolId.LP_3,
  SymbolId.LP_4,
  SymbolId.LP_5
];

export const HP_SYMBOLS: SymbolId[] = [
  SymbolId.HP_1,
  SymbolId.HP_2,
  SymbolId.HP_3
];

export const PAYING_SYMBOLS: SymbolId[] = [...LP_SYMBOLS, ...HP_SYMBOLS];

export const ALL_SYMBOLS: SymbolId[] = Object.values(SymbolId);

/**
 * Check if a symbol can substitute for another
 */
export function canSubstitute(substitutor: SymbolId, target: SymbolId): boolean {
  const substitutorDef = SYMBOL_DEFINITIONS[substitutor];
  const targetDef = SYMBOL_DEFINITIONS[target];

  return substitutorDef.substitutes && targetDef.canBeSubstituted;
}

/**
 * Check if two symbols match (considering wild substitution)
 */
export function symbolsMatch(a: SymbolId, b: SymbolId): boolean {
  if (a === b) return true;
  if (canSubstitute(a, b)) return true;
  if (canSubstitute(b, a)) return true;
  return false;
}
