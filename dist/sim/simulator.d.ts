/**
 * SLOT MATH ENGINE TEMPLATE - Monte Carlo Simulator
 *
 * High-performance simulation engine:
 * - Single-threaded optimized loop
 * - Streaming statistics (no memory bloat)
 * - Progress reporting
 * - Seed control for reproducibility
 * - H&W + FS dual feature tracking
 */
import { SimulationResults } from './stats.js';
/**
 * Simulation configuration
 */
export interface SimulationConfig {
    spins: number;
    seed?: number;
    progressInterval?: number;
    verbose?: boolean;
}
/**
 * Progress callback type
 */
export type ProgressCallback = (spinsCompleted: number, totalSpins: number, currentRTP: number) => void;
/**
 * Run simulation
 */
export declare function runSimulation(config: SimulationConfig, onProgress?: ProgressCallback): Promise<SimulationResults>;
/**
 * Run quick validation simulation
 */
export declare function runQuickSim(seed?: number): Promise<SimulationResults>;
/**
 * Run full certification simulation
 */
export declare function runFullSim(seed?: number): Promise<SimulationResults>;
/**
 * Run multi-seed batch simulation
 */
export declare function runBatchSimulation(spinsPerSeed: number, seeds: number[], verbose?: boolean): Promise<{
    results: SimulationResults[];
    aggregate: AggregateResults;
}>;
/**
 * Aggregate results interface
 */
export interface AggregateResults {
    seedCount: number;
    totalSpins: number;
    meanRTP: number;
    minRTP: number;
    maxRTP: number;
    rtpStdDev: number;
    meanHitRate: number;
    meanFSFrequency: number;
    meanHnWFrequency: number;
    maxObservedWin: number;
}
//# sourceMappingURL=simulator.d.ts.map