/**
 * SLOT MATH ENGINE TEMPLATE - Piscina Worker Pool Manager
 *
 * Professional worker pool using piscina for:
 * - Automatic thread management
 * - Optimal CPU utilization
 * - Clean task distribution
 * - Graceful shutdown
 *
 * Usage:
 *   const pool = new SimulationPool();
 *   const result = await pool.runSimulation({ ... });
 *   await pool.destroy();
 */
import { SimulationStatistics } from '../sim/accumulator.js';
export interface PoolSimulationOptions {
    totalSpins: number;
    bet: number;
    baseSeed: number;
    mode: 'base' | 'fs' | 'full';
    workerCount?: number;
    onProgress?: (progress: PoolProgress) => void;
}
export interface PoolProgress {
    spinsCompleted: number;
    totalSpins: number;
    percentComplete: number;
    elapsedMs: number;
    estimatedRemainingMs: number;
    spinsPerSecond: number;
}
export interface PoolSimulationResult {
    statistics: SimulationStatistics;
    elapsedMs: number;
    spinsPerSecond: number;
    workerCount: number;
    workerStats: {
        workerId: number;
        spinsCompleted: number;
        elapsedMs: number;
    }[];
}
/**
 * Piscina-based simulation pool
 */
export declare class SimulationPool {
    private pool;
    private isDestroyed;
    constructor(workerCount?: number);
    /**
     * Run parallel simulation across all workers
     */
    runSimulation(options: PoolSimulationOptions): Promise<PoolSimulationResult>;
    /**
     * Get current pool statistics
     */
    getStats(): {
        threads: any;
        completed: any;
        utilization: any;
    };
    /**
     * Gracefully shutdown the pool
     */
    destroy(): Promise<void>;
}
/**
 * Quick helper for one-off simulations
 */
export declare function runPooledSimulation(options: PoolSimulationOptions): Promise<PoolSimulationResult>;
/**
 * Get optimal worker count for this machine
 */
export declare function getOptimalWorkerCount(): number;
//# sourceMappingURL=pool.d.ts.map