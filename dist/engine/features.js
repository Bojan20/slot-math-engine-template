/**
 * SLOT MATH ENGINE TEMPLATE - Feature Engine
 *
 * Handles Free Spins feature logic:
 * - FS trigger and awarding
 * - Progressive multiplier (+1x each spin without win, reset on win)
 * - Retrigger handling
 * - H&W can trigger during FS
 */
import { spin } from './spin.js';
import { evaluate } from './evaluate.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { runHnWQuick } from './holdAndWin.js';
/**
 * Initialize a Free Spins session
 */
export function initFreeSpinsState(spinsAwarded) {
    return {
        remainingSpins: spinsAwarded,
        totalSpinsAwarded: spinsAwarded,
        retriggersCount: 0,
        progressiveMultiplier: 1, // Starts at 1x
        spinsPlayed: 0,
        hnwTriggersCount: 0
    };
}
/**
 * Handle retrigger in Free Spins
 */
function handleRetrigger(state, spinsAwarded) {
    const maxFS = GAME_CONFIG.caps.maxFreeSpinsFromRetrigger;
    // Cap total FS
    const actualAwarded = Math.min(spinsAwarded, maxFS - state.totalSpinsAwarded);
    if (actualAwarded <= 0) {
        return state; // At cap, no more retriggers
    }
    return {
        ...state,
        remainingSpins: state.remainingSpins + actualAwarded,
        totalSpinsAwarded: state.totalSpinsAwarded + actualAwarded,
        retriggersCount: state.retriggersCount + 1
        // v7: Progressive multiplier not affected by retrigger
    };
}
/**
 * Run a single Free Spin (v7: progressive multiplier)
 */
function runFreeSpin(rng, state) {
    // Use FS reels
    const spinData = spin(rng, true);
    // Evaluate with progressive multiplier
    const evaluation = evaluate(spinData.grid, rng, state.progressiveMultiplier);
    const hasWin = evaluation.baseWin > 0;
    // v7 Progressive multiplier logic:
    // - If no win: +1x (up to max)
    // - If win: reset to 1x
    let newMultiplier;
    if (hasWin) {
        newMultiplier = 1; // Reset on win
    }
    else {
        newMultiplier = Math.min(state.progressiveMultiplier + 1, GAME_CONFIG.freeSpins.maxMultiplier);
    }
    let newState = {
        ...state,
        remainingSpins: state.remainingSpins - 1,
        spinsPlayed: state.spinsPlayed + 1,
        progressiveMultiplier: newMultiplier
    };
    // Handle retrigger
    let retriggered = false;
    let spinsAwarded = 0;
    if (evaluation.triggeredFS && state.retriggersCount < GAME_CONFIG.freeSpins.maxRetriggers) {
        retriggered = true;
        spinsAwarded = evaluation.freeSpinsAwarded;
        newState = handleRetrigger(newState, spinsAwarded);
    }
    // Handle H&W trigger during FS
    let hnwTriggered = false;
    let hnwWin = 0;
    if (evaluation.triggeredHnW) {
        hnwTriggered = true;
        const hnwResult = runHnWQuick(spinData.grid, rng);
        hnwWin = hnwResult.totalWin;
        newState = {
            ...newState,
            hnwTriggersCount: newState.hnwTriggersCount + 1
        };
    }
    const result = {
        spinNumber: state.spinsPlayed + 1,
        grid: spinData.grid,
        evaluation,
        win: evaluation.totalWin + hnwWin,
        multiplierApplied: state.progressiveMultiplier,
        retriggered,
        spinsAwarded,
        hnwTriggered,
        hnwWin
    };
    return { result, newState };
}
/**
 * Run complete Free Spins session
 */
export function runFreeSpinsSession(rng, initialSpinsAwarded) {
    let state = initFreeSpinsState(initialSpinsAwarded);
    const spinResults = [];
    let totalWin = 0;
    let maxMultiplier = 1;
    let hnwTotalWin = 0;
    while (state.remainingSpins > 0) {
        const { result, newState } = runFreeSpin(rng, state);
        spinResults.push(result);
        totalWin += result.win;
        if (result.multiplierApplied > maxMultiplier) {
            maxMultiplier = result.multiplierApplied;
        }
        if (result.hnwTriggered) {
            hnwTotalWin += result.hnwWin;
        }
        state = newState;
    }
    return {
        initialSpinsAwarded,
        totalSpinsPlayed: state.spinsPlayed,
        retriggersCount: state.retriggersCount,
        maxMultiplier,
        spinResults,
        totalWin,
        averageWinPerSpin: state.spinsPlayed > 0 ? totalWin / state.spinsPlayed : 0,
        hnwTriggersCount: state.hnwTriggersCount,
        hnwTotalWin
    };
}
/**
 * Quick Free Spins run (no detailed results, for simulation)
 * Returns just the total win
 */
export function runFreeSpinsQuick(rng, initialSpinsAwarded) {
    let state = initFreeSpinsState(initialSpinsAwarded);
    let totalWin = 0;
    let maxMultiplier = 1;
    let hnwTotalWin = 0;
    while (state.remainingSpins > 0) {
        // Use FS reels
        const spinData = spin(rng, true);
        // Evaluate with progressive multiplier
        const evaluation = evaluate(spinData.grid, rng, state.progressiveMultiplier);
        totalWin += evaluation.totalWin;
        // Track max multiplier
        if (state.progressiveMultiplier > maxMultiplier) {
            maxMultiplier = state.progressiveMultiplier;
        }
        // v7 Progressive multiplier logic
        const hasWin = evaluation.baseWin > 0;
        let newMultiplier;
        if (hasWin) {
            newMultiplier = 1;
        }
        else {
            newMultiplier = Math.min(state.progressiveMultiplier + 1, GAME_CONFIG.freeSpins.maxMultiplier);
        }
        // Update state
        state = {
            ...state,
            remainingSpins: state.remainingSpins - 1,
            spinsPlayed: state.spinsPlayed + 1,
            progressiveMultiplier: newMultiplier
        };
        // Handle retrigger
        if (evaluation.triggeredFS && state.retriggersCount < GAME_CONFIG.freeSpins.maxRetriggers) {
            state = handleRetrigger(state, evaluation.freeSpinsAwarded);
        }
        // Handle H&W trigger during FS
        if (evaluation.triggeredHnW) {
            const hnwResult = runHnWQuick(spinData.grid, rng);
            totalWin += hnwResult.totalWin;
            hnwTotalWin += hnwResult.totalWin;
            state = {
                ...state,
                hnwTriggersCount: state.hnwTriggersCount + 1
            };
        }
    }
    return {
        totalWin,
        totalSpins: state.spinsPlayed,
        retriggersCount: state.retriggersCount,
        maxMultiplier,
        hnwTriggersCount: state.hnwTriggersCount,
        hnwTotalWin
    };
}
/**
 * Calculate expected FS value (theoretical)
 * Used for quick RTP estimation
 */
export function estimateFSExpectedValue() {
    // v7: Updated estimates for 8/12/15 spin awards
    const avgInitialSpins = (8 + 12 + 15) / 3; // ~11.67
    const retriggerRate = 0.01; // Estimated 1% retrigger chance per FS spin
    const avgRetriggerSpins = avgInitialSpins * 0.5;
    // Geometric series for expected total spins
    const avgSpins = avgInitialSpins / (1 - retriggerRate * avgRetriggerSpins / avgInitialSpins);
    // v7: Progressive multiplier increases avg win
    // With max 10x and reset on win, effective avg ~2-3x
    const avgWinPerSpin = 3.5; // Placeholder - simulation will refine
    return {
        avgSpins,
        avgWinPerSpin,
        expectedTotalWin: avgSpins * avgWinPerSpin
    };
}
/**
 * Wrapper function for testing - runs FS with starting multiplier
 * Returns result compatible with test expectations
 */
export function playFreeSpins(initialSpinsAwarded, rng, _startingMultiplier = 1 // Ignored in v7, progressive starts at 1x
) {
    const result = runFreeSpinsQuick(rng, initialSpinsAwarded);
    return {
        totalWin: result.totalWin,
        spinsPlayed: result.totalSpins,
        retriggerCount: result.retriggersCount
    };
}
//# sourceMappingURL=features.js.map