/**
 * SLOT MATH ENGINE TEMPLATE - Worker Thread for Parallel Simulation
 *
 * Each worker runs a batch of spins independently and returns
 * aggregated statistics to the main thread.
 */
import { AccumulatorData } from './accumulator.js';
export interface WorkerInput {
    workerIndex: number;
    seed: number;
    spinsToRun: number;
    bet: number;
    mode: 'base' | 'fs' | 'full';
    startSpinIndex: number;
}
export interface WorkerOutput {
    workerIndex: number;
    data: AccumulatorData;
    elapsedMs: number;
    spinsCompleted: number;
}
export interface WorkerProgress {
    workerIndex: number;
    spinsCompleted: number;
    currentRtp: number;
}
declare function runSimulation(input: WorkerInput): WorkerOutput;
export { runSimulation };
//# sourceMappingURL=worker.d.ts.map