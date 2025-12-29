/**
 * SLOT MATH ENGINE TEMPLATE - Feature Engine
 *
 * Handles Free Spins feature logic:
 * - FS trigger and awarding
 * - Progressive multiplier (+1x each spin without win, reset on win)
 * - Retrigger handling
 * - H&W can trigger during FS
 */
import { RNG } from './rng.js';
import { Grid } from './spin.js';
import { EvaluationResult } from './evaluate.js';
/**
 * State of an active Free Spins session
 */
export interface FreeSpinsState {
    remainingSpins: number;
    totalSpinsAwarded: number;
    retriggersCount: number;
    progressiveMultiplier: number;
    spinsPlayed: number;
    hnwTriggersCount: number;
}
/**
 * Result of a single FS spin
 */
export interface FreeSpinResult {
    spinNumber: number;
    grid: Grid;
    evaluation: EvaluationResult;
    win: number;
    multiplierApplied: number;
    retriggered: boolean;
    spinsAwarded: number;
    hnwTriggered: boolean;
    hnwWin: number;
}
/**
 * Complete Free Spins session result
 */
export interface FreeSpinsSessionResult {
    initialSpinsAwarded: number;
    totalSpinsPlayed: number;
    retriggersCount: number;
    maxMultiplier: number;
    spinResults: FreeSpinResult[];
    totalWin: number;
    averageWinPerSpin: number;
    hnwTriggersCount: number;
    hnwTotalWin: number;
}
/**
 * Initialize a Free Spins session
 */
export declare function initFreeSpinsState(spinsAwarded: number): FreeSpinsState;
/**
 * Run complete Free Spins session
 */
export declare function runFreeSpinsSession(rng: RNG, initialSpinsAwarded: number): FreeSpinsSessionResult;
/**
 * Quick Free Spins run (no detailed results, for simulation)
 * Returns just the total win
 */
export declare function runFreeSpinsQuick(rng: RNG, initialSpinsAwarded: number): {
    totalWin: number;
    totalSpins: number;
    retriggersCount: number;
    maxMultiplier: number;
    hnwTriggersCount: number;
    hnwTotalWin: number;
};
/**
 * Calculate expected FS value (theoretical)
 * Used for quick RTP estimation
 */
export declare function estimateFSExpectedValue(): {
    avgSpins: number;
    avgWinPerSpin: number;
    expectedTotalWin: number;
};
/**
 * Wrapper function for testing - runs FS with starting multiplier
 * Returns result compatible with test expectations
 */
export declare function playFreeSpins(initialSpinsAwarded: number, rng: RNG, _startingMultiplier?: number): {
    totalWin: number;
    spinsPlayed: number;
    retriggerCount: number;
};
//# sourceMappingURL=features.d.ts.map