/**
 * FEATURES TEMPLATE
 *
 * Template za Free Spins i druge feature mehanike.
 * Kopiraj u features.ts i prilagodi.
 */
import { SymbolId } from '../model/symbols.js';
export const FREE_SPINS_CONFIG = {
    enabled: true,
    triggerSymbol: SymbolId.SCATTER,
    triggerCounts: {
        min: 3,
        awards: {
            3: 8, // 3 scatters = 8 spins
            4: 12, // 4 scatters = 12 spins
            5: 15, // 5 scatters = 15 spins
        }
    },
    retrigger: {
        enabled: true,
        sameRules: true,
    },
    multiplier: {
        enabled: true,
        type: 'progressive',
        initial: 1,
        increment: 1, // +1x on each winning spin
        max: 10, // Cap at 10x
        resetOnFeatureEnd: true,
    },
    specialReels: true,
};
export function createInitialFSState() {
    return {
        active: false,
        spinsRemaining: 0,
        spinsPlayed: 0,
        totalSpinsAwarded: 0,
        currentMultiplier: FREE_SPINS_CONFIG.multiplier.initial,
        totalWin: 0,
        retriggersCount: 0,
    };
}
// ============================================
// FREE SPINS LOGIC
// ============================================
export function checkFreeSpinsTrigger(scatterCount) {
    if (!FREE_SPINS_CONFIG.enabled) {
        return { triggered: false, spinsAwarded: 0 };
    }
    if (scatterCount >= FREE_SPINS_CONFIG.triggerCounts.min) {
        const spins = FREE_SPINS_CONFIG.triggerCounts.awards[scatterCount] ||
            FREE_SPINS_CONFIG.triggerCounts.awards[FREE_SPINS_CONFIG.triggerCounts.min];
        return { triggered: true, spinsAwarded: spins };
    }
    return { triggered: false, spinsAwarded: 0 };
}
export function updateMultiplier(state, hasWin) {
    if (!FREE_SPINS_CONFIG.multiplier.enabled) {
        return 1;
    }
    if (FREE_SPINS_CONFIG.multiplier.type === 'progressive' && hasWin) {
        const newMult = Math.min(state.currentMultiplier + FREE_SPINS_CONFIG.multiplier.increment, FREE_SPINS_CONFIG.multiplier.max);
        return newMult;
    }
    return state.currentMultiplier;
}
export const HOLD_AND_WIN_CONFIG = {
    enabled: true,
    name: 'Bonus Feature',
    triggerSymbol: SymbolId.SPECIAL,
    triggerCount: 5, // 5+ specials to trigger (6+ typical for H&W)
    initialRespins: 3,
    maxRespins: 3,
    gridSize: 15, // 5 reels × 3 rows
    jackpot: {
        enabled: true,
        fullGridBonus: 1000, // +1000x for full grid
    }
};
/**
 * Value distribution for special symbols in H&W
 * Weights must sum to 10000 for precision
 *
 * Target avg value: ~4-5x per symbol
 */
export const SPECIAL_VALUE_TABLE = [
    // Cash values (99.8% total)
    { value: { type: 'cash', multiplier: 1 }, weight: 2800 }, // 28%
    { value: { type: 'cash', multiplier: 2 }, weight: 2500 }, // 25%
    { value: { type: 'cash', multiplier: 4 }, weight: 2000 }, // 20%
    { value: { type: 'cash', multiplier: 8 }, weight: 1400 }, // 14%
    { value: { type: 'cash', multiplier: 15 }, weight: 800 }, // 8%
    { value: { type: 'cash', multiplier: 30 }, weight: 350 }, // 3.5%
    { value: { type: 'cash', multiplier: 60 }, weight: 130 }, // 1.3%
    // Jackpot tiers (0.2% total)
    { value: { type: 'mini', multiplier: 25 }, weight: 12 }, // 0.12%
    { value: { type: 'minor', multiplier: 75 }, weight: 5 }, // 0.05%
    { value: { type: 'major', multiplier: 200 }, weight: 2 }, // 0.02%
    { value: { type: 'grand', multiplier: 750 }, weight: 1 }, // 0.01%
];
// ============================================
// H&W HELPERS
// ============================================
export function getRandomSpecialValue(random) {
    const totalWeight = SPECIAL_VALUE_TABLE.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.floor(random() * totalWeight);
    for (const entry of SPECIAL_VALUE_TABLE) {
        roll -= entry.weight;
        if (roll < 0) {
            return entry.value;
        }
    }
    return SPECIAL_VALUE_TABLE[0].value;
}
export function calculateAverageSpecialValue() {
    const totalWeight = SPECIAL_VALUE_TABLE.reduce((sum, e) => sum + e.weight, 0);
    let weightedSum = 0;
    for (const entry of SPECIAL_VALUE_TABLE) {
        weightedSum += entry.value.multiplier * entry.weight;
    }
    return weightedSum / totalWeight;
}
export const COLLECTOR_CONFIG = {
    enabled: false, // Omogući ako koristiš
    name: 'Collector Bonus',
    triggerMethod: 'bonus_symbol',
    rounds: 3,
    values: {
        multipliers: [1, 2, 3, 5, 10, 25, 50],
        extraPicks: 1,
        prizeWheel: false,
    },
    escalation: {
        enabled: true,
        levels: 3,
        multiplierPerLevel: 2,
    },
    cap: 500,
};
// ============================================
// FEATURE CAPS (Safety)
// ============================================
export const FEATURE_CAPS = {
    maxFreeSpins: 100, // Max total FS in one session
    maxRetriggers: 5, // Max FS retriggers
    maxHWRounds: 50, // Max H&W respins
    maxFeatureWin: 5000, // Hard cap on any feature win (x bet)
    maxTotalWin: 5000, // Hard cap on total spin win (x bet)
};
export function applyWinCap(win, bet) {
    const maxWin = FEATURE_CAPS.maxTotalWin * bet;
    return Math.min(win, maxWin);
}
//# sourceMappingURL=features.template.js.map