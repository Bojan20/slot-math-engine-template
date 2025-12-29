/**
 * SLOT MATH ENGINE TEMPLATE - Tuning Assistant
 *
 * Generates automatic tuning hints based on simulation results.
 * Helps non-mathematicians understand what to adjust.
 */
import { SimulationStatistics } from '../sim/accumulator.js';
export type HintSeverity = 'info' | 'warn' | 'critical';
export interface TuningHint {
    severity: HintSeverity;
    category: string;
    message: string;
    suggestion?: string;
}
export interface MathLockChecklist {
    rtpWithinTarget: boolean;
    ciCoversTarget: boolean;
    fsFrequencyOk: boolean;
    hnwFrequencyOk: boolean;
    hitRateOk: boolean;
    volatilityMeasured: boolean;
    maxWinObserved: boolean;
    spinsSufficient: boolean;
}
/**
 * Generate tuning hints based on simulation results
 */
export declare function generateTuningHints(stats: SimulationStatistics): TuningHint[];
/**
 * Generate Math Lock Checklist
 */
export declare function generateMathLockChecklist(stats: SimulationStatistics): MathLockChecklist;
/**
 * Format hints for console output
 */
export declare function formatHintsForConsole(hints: TuningHint[]): string;
/**
 * Format Math Lock Checklist for console
 */
export declare function formatChecklistForConsole(checklist: MathLockChecklist): string;
/**
 * Check if math is ready for lock
 */
export declare function isMathLockReady(checklist: MathLockChecklist): boolean;
//# sourceMappingURL=tuningAssistant.d.ts.map