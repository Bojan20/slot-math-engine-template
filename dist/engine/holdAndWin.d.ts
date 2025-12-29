/**
 * SLOT MATH ENGINE TEMPLATE - Hold & Win Engine
 *
 * Cash Eruption style Hold & Win feature:
 * - Triggered by configurable number of Special symbols
 * - Respins (reset on new symbol)
 * - Each symbol carries cash value or jackpot tier
 * - Full grid = Jackpot bonus
 *
 * USES symbolConfig.ts for symbol role abstraction
 */
import { RNG } from './rng.js';
import { Grid } from './spin.js';
/**
 * Orb value types
 */
export type OrbValueType = 'cash' | 'mini' | 'minor' | 'major' | 'grand';
export interface OrbValue {
    type: OrbValueType;
    multiplier: number;
}
/**
 * Orb value distribution (weights must sum to 10000 for precision)
 *
 * Target: H&W avg win ~41x for ~21.5% RTP contribution
 * H&W frequency: 1/191, need (41x * 1/191) = 21.5% contribution
 * Total: Base 53% + FS 18.5% + H&W 21.5% + Scatter 2.15% = 95.15% + 0.85% tolerance = 96%
 */
export declare const ORB_VALUE_TABLE: Array<{
    value: OrbValue;
    weight: number;
}>;
/**
 * Jackpot bonus for full grid (all positions filled)
 * Rename this constant for your game theme
 */
export declare const FULL_GRID_JACKPOT_BONUS = 1000;
/**
 * Hold & Win configuration
 */
export declare const HNW_CONFIG: {
    triggerOrbCount: number;
    initialRespins: number;
    maxRespins: number;
    gridSize: number;
};
/**
 * Position on the grid
 */
export interface GridPosition {
    row: number;
    reel: number;
}
/**
 * Locked orb during H&W
 */
export interface LockedOrb {
    position: GridPosition;
    value: OrbValue;
}
/**
 * H&W session state
 */
export interface HnWState {
    lockedOrbs: LockedOrb[];
    respinsRemaining: number;
    totalRespins: number;
    isComplete: boolean;
}
/**
 * Single respin result
 */
export interface RespinResult {
    newOrbs: LockedOrb[];
    respinsRemaining: number;
    gridFilled: boolean;
}
/**
 * Complete H&W session result
 */
export interface HnWSessionResult {
    triggeredWith: number;
    finalOrbCount: number;
    totalRespins: number;
    lockedOrbs: LockedOrb[];
    cashTotal: number;
    fullGridJackpot: boolean;
    fullGridBonus: number;
    totalWin: number;
}
/**
 * Roll an orb value using weighted random
 */
export declare function rollOrbValue(rng: RNG): OrbValue;
/**
 * Count Special symbols in a grid
 * Uses symbolConfig.isSpecial() for detection
 */
export declare function countSpecialSymbols(grid: Grid): number;
export declare function countLightningOrbs(grid: Grid): number;
/**
 * Get all Special symbol positions from initial trigger grid
 * Uses symbolConfig.isSpecial() for detection
 */
export declare function getSpecialPositions(grid: Grid): GridPosition[];
export declare function getOrbPositions(grid: Grid): GridPosition[];
/**
 * Check if H&W should trigger
 */
export declare function shouldTriggerHnW(grid: Grid): boolean;
/**
 * Initialize H&W session from trigger grid
 */
export declare function initHnWSession(grid: Grid, rng: RNG): HnWState;
/**
 * Execute a single respin
 */
export declare function executeRespin(state: HnWState, rng: RNG): RespinResult;
/**
 * Run complete Hold & Win session
 */
export declare function runHnWSession(grid: Grid, rng: RNG): HnWSessionResult;
/**
 * Quick H&W run for simulation (minimal memory)
 */
export declare function runHnWQuick(grid: Grid, rng: RNG): {
    totalWin: number;
    orbCount: number;
    respins: number;
    fullGridJackpot: boolean;
};
/**
 * Calculate expected value of H&W feature
 * Used for RTP estimation
 */
export declare function calculateHnWExpectedValue(): {
    avgOrbValue: number;
    avgOrbsOnTrigger: number;
    avgOrbsAfterRespins: number;
    avgTotalWin: number;
    fullGridProbability: number;
};
//# sourceMappingURL=holdAndWin.d.ts.map