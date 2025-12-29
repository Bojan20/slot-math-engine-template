/**
 * Parallel Simulation Coordinator
 *
 * Manages worker threads and merges results for large-scale simulations.
 */
import { SimulationStatistics } from './accumulator.js';
export interface ParallelSimOptions {
    totalSpins: number;
    bet: number;
    baseSeed: number;
    workerCount: number;
    mode: 'base' | 'fs' | 'full';
    onProgress?: (progress: SimulationProgress) => void;
}
export interface SimulationProgress {
    spinsCompleted: number;
    totalSpins: number;
    percentComplete: number;
    currentRtp: number;
    elapsedMs: number;
    estimatedRemainingMs: number;
    spinsPerSecond: number;
}
export interface ParallelSimResult {
    statistics: SimulationStatistics;
    elapsedMs: number;
    spinsPerSecond: number;
    workerStats: {
        workerIndex: number;
        spinsCompleted: number;
        elapsedMs: number;
    }[];
}
export declare function runParallelSimulation(options: ParallelSimOptions): Promise<ParallelSimResult>;
/**
 * Run simulation in a single thread (fallback for small runs or debugging)
 */
export declare function runSingleThreadSimulation(options: Omit<ParallelSimOptions, 'workerCount'>): ParallelSimResult;
//# sourceMappingURL=parallel.d.ts.map