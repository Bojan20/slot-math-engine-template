/**
 * SLOT MATH ENGINE TEMPLATE - Piscina Simulation Worker
 *
 * High-performance worker for parallel Monte Carlo simulation.
 * Uses pure-rand for deterministic RNG.
 *
 * This worker is spawned by piscina and receives:
 * - seed: deterministic seed for this worker
 * - spins: number of spins to simulate
 * - bet: bet size
 * - mode: 'base' | 'fs' | 'full'
 *
 * Returns aggregated statistics that can be merged with other workers.
 */
import { AccumulatorData } from '../sim/accumulator.js';
export interface WorkerTask {
    workerId: number;
    seed: number;
    spins: number;
    bet: number;
    mode: 'base' | 'fs' | 'full';
}
export interface WorkerResult {
    workerId: number;
    data: AccumulatorData;
    spinsCompleted: number;
    elapsedMs: number;
}
/**
 * Main worker function - exported for piscina
 */
export default function runSimulationWorker(task: WorkerTask): WorkerResult;
//# sourceMappingURL=simWorker.d.ts.map