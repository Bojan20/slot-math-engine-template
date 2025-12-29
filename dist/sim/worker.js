/**
 * SLOT MATH ENGINE TEMPLATE - Worker Thread for Parallel Simulation
 *
 * Each worker runs a batch of spins independently and returns
 * aggregated statistics to the main thread.
 */
import { parentPort, workerData } from 'worker_threads';
import { RNG } from '../engine/rng.js';
import { spin } from '../engine/spin.js';
import { evaluate } from '../engine/evaluate.js';
import { runFreeSpinsQuick } from '../engine/features.js';
import { runHnWQuick } from '../engine/holdAndWin.js';
import { StatsAccumulator } from './accumulator.js';
function runSimulation(input) {
    const startTime = performance.now();
    const rng = new RNG(input.seed);
    const accumulator = new StatsAccumulator(input.bet, input.workerIndex);
    const progressInterval = Math.floor(input.spinsToRun / 10);
    let lastProgress = 0;
    for (let i = 0; i < input.spinsToRun; i++) {
        // Generate base game spin
        const spinData = spin(rng, false);
        // Evaluate base game
        const result = evaluate(spinData.grid, rng, 1);
        // Record base spin
        accumulator.recordBaseSpin(result.lineWinTotal, result.scatterWin, result.multiplier, result.triggeredFS, result.triggeredHnW);
        // Handle Free Spins if triggered and mode allows
        if (result.triggeredFS && input.mode !== 'base') {
            const fsResult = runFreeSpinsQuick(rng, result.freeSpinsAwarded);
            accumulator.recordFreeSpinsSession(fsResult.totalWin, fsResult.totalSpins, fsResult.retriggersCount, result.scatterWin * result.multiplier, fsResult.maxMultiplier);
        }
        // Handle Hold & Win if triggered and mode allows
        if (result.triggeredHnW && input.mode !== 'base') {
            const hnwResult = runHnWQuick(spinData.grid, rng);
            accumulator.recordHnWSession(hnwResult.totalWin, hnwResult.orbCount, hnwResult.respins, hnwResult.fullGridJackpot);
        }
        // Send progress updates
        if (parentPort && i - lastProgress >= progressInterval) {
            const data = accumulator.getData();
            const progress = {
                workerIndex: input.workerIndex,
                spinsCompleted: i + 1,
                currentRtp: (data.totalWin / data.totalWagered) * 100
            };
            parentPort.postMessage({ type: 'progress', data: progress });
            lastProgress = i;
        }
    }
    const elapsedMs = performance.now() - startTime;
    return {
        workerIndex: input.workerIndex,
        data: accumulator.getData(),
        elapsedMs,
        spinsCompleted: input.spinsToRun
    };
}
// Worker entry point
if (parentPort) {
    const input = workerData;
    const output = runSimulation(input);
    parentPort.postMessage({ type: 'complete', data: output });
}
export { runSimulation };
//# sourceMappingURL=worker.js.map