/**
 * FEATURES TEMPLATE
 *
 * Template za Free Spins i druge feature mehanike.
 * Kopiraj u features.ts i prilagodi.
 */
import { SymbolId } from '../model/symbols.js';
export interface FreeSpinsConfig {
    enabled: boolean;
    triggerSymbol: SymbolId;
    triggerCounts: {
        min: number;
        awards: Record<number, number>;
    };
    retrigger: {
        enabled: boolean;
        sameRules: boolean;
    };
    multiplier: {
        enabled: boolean;
        type: 'progressive' | 'fixed' | 'random';
        initial: number;
        increment: number;
        max: number;
        resetOnFeatureEnd: boolean;
    };
    specialReels: boolean;
}
export declare const FREE_SPINS_CONFIG: FreeSpinsConfig;
export interface FreeSpinsState {
    active: boolean;
    spinsRemaining: number;
    spinsPlayed: number;
    totalSpinsAwarded: number;
    currentMultiplier: number;
    totalWin: number;
    retriggersCount: number;
}
export declare function createInitialFSState(): FreeSpinsState;
export declare function checkFreeSpinsTrigger(scatterCount: number): {
    triggered: boolean;
    spinsAwarded: number;
};
export declare function updateMultiplier(state: FreeSpinsState, hasWin: boolean): number;
export interface HoldAndWinConfig {
    enabled: boolean;
    name: string;
    triggerSymbol: SymbolId;
    triggerCount: number;
    initialRespins: number;
    maxRespins: number;
    gridSize: number;
    jackpot: {
        enabled: boolean;
        fullGridBonus: number;
    };
}
export declare const HOLD_AND_WIN_CONFIG: HoldAndWinConfig;
export interface SpecialValue {
    type: 'cash' | 'mini' | 'minor' | 'major' | 'grand';
    multiplier: number;
}
/**
 * Value distribution for special symbols in H&W
 * Weights must sum to 10000 for precision
 *
 * Target avg value: ~4-5x per symbol
 */
export declare const SPECIAL_VALUE_TABLE: Array<{
    value: SpecialValue;
    weight: number;
}>;
export declare function getRandomSpecialValue(random: () => number): SpecialValue;
export declare function calculateAverageSpecialValue(): number;
export interface CollectorConfig {
    enabled: boolean;
    name: string;
    triggerMethod: 'scatter' | 'bonus_symbol' | 'random';
    rounds: number;
    values: {
        multipliers: number[];
        extraPicks: number;
        prizeWheel: boolean;
    };
    escalation: {
        enabled: boolean;
        levels: number;
        multiplierPerLevel: number;
    };
    cap: number;
}
export declare const COLLECTOR_CONFIG: CollectorConfig;
export declare const FEATURE_CAPS: {
    maxFreeSpins: number;
    maxRetriggers: number;
    maxHWRounds: number;
    maxFeatureWin: number;
    maxTotalWin: number;
};
export declare function applyWinCap(win: number, bet: number): number;
//# sourceMappingURL=features.template.d.ts.map