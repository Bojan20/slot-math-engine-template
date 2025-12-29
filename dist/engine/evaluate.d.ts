/**
 * SLOT MATH ENGINE TEMPLATE - Win Evaluation Engine
 *
 * Evaluates all wins from a spin:
 * - Line wins (L→R with wild substitution)
 * - Scatter wins (anywhere, 1 per reel max)
 * - Special symbol detection (for H&W trigger)
 * - Free spins trigger detection
 *
 * USES symbolConfig.ts for symbol role abstraction
 */
import { SymbolId } from '../model/symbols.js';
import { Grid } from './spin.js';
import { RNG } from './rng.js';
/**
 * Single line win result
 */
export interface LineWin {
    lineIndex: number;
    symbol: SymbolId;
    count: number;
    pay: number;
    positions: Array<{
        row: number;
        reel: number;
    }>;
}
/**
 * Scatter result
 */
export interface ScatterResult {
    count: number;
    pay: number;
    triggersFS: boolean;
    freeSpinsAwarded: number;
    positions: Array<{
        row: number;
        reel: number;
    }>;
}
/**
 * Special symbol result (for H&W trigger detection)
 * Renamed from LightningOrbResult for template flexibility
 */
export interface SpecialSymbolResult {
    count: number;
    triggersHnW: boolean;
    positions: Array<{
        row: number;
        reel: number;
    }>;
}
export type LightningOrbResult = SpecialSymbolResult;
/**
 * Complete spin evaluation result
 */
export interface EvaluationResult {
    lineWins: LineWin[];
    lineWinTotal: number;
    scatterResult: ScatterResult | null;
    scatterWin: number;
    specialSymbolResult: SpecialSymbolResult | null;
    lightningOrbResult: LightningOrbResult | null;
    baseWin: number;
    multiplier: number;
    totalWin: number;
    triggeredFS: boolean;
    freeSpinsAwarded: number;
    triggeredHnW: boolean;
}
/**
 * Full evaluation of a spin
 */
export declare function evaluate(grid: Grid, _rng: RNG, // Kept for API compatibility, not used in v7
fsGlobalMultiplier?: number): EvaluationResult;
/**
 * Quick check if grid has any win (for stats)
 * Uses symbolConfig helpers for symbol detection
 */
export declare function hasAnyWin(grid: Grid): boolean;
//# sourceMappingURL=evaluate.d.ts.map