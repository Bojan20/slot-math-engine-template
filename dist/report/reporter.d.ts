/**
 * SLOT MATH ENGINE TEMPLATE - Report Generator
 *
 * Generates standardized SimReport.json and PAR.csv files
 * with full provenance and reproducibility information.
 */
import { SimulationStatistics } from '../sim/accumulator.js';
import { StandardPercentiles, TailBuckets } from '../utils/histogram.js';
import { CLIArgs } from '../cli/args.js';
import { TuningHint, MathLockChecklist } from './tuningAssistant.js';
export interface SimReport {
    schemaVersion: string;
    generatedAt: string;
    metadata: {
        gameId: string;
        mathVersion: string;
        gitCommit: string | null;
        configChecksum: string;
        reelsChecksum: string;
    };
    simulation: {
        totalSpins: number;
        bet: number;
        baseSeed: number;
        workers: number;
        mode: string;
        elapsedMs: number;
        spinsPerSecond: number;
    };
    config: {
        layout: {
            reels: number;
            rows: number;
        };
        paylines: number;
        targetRtp: number;
        maxWin: number;
        volatility: string;
    };
    results: {
        rtp: {
            observed: number;
            ci95Low: number;
            ci95High: number;
            ci95Margin: number;
            breakdown: {
                base: number;
                scatter: number;
                freeSpins: number;
                holdAndWin: number;
            };
        };
        hitRate: number;
        deadSpinRate: number;
        avgWinOnHit: number;
    };
    features: {
        freeSpins: {
            triggerRate: number;
            avgSpins: number;
            avgWin: number;
            retriggerRate: number;
            totalTriggers: number;
            maxMultiplier: number;
        };
        holdAndWin: {
            frequency: number;
            avgOrbs: number;
            avgWin: number;
            fullGridJackpotRate: number;
            totalTriggers: number;
        };
    };
    volatility: {
        stdDev: number;
        index: number;
        classification: string;
    };
    extremes: {
        maxWinObserved: number;
        maxWinSpinIndex: number;
        tail100x: number;
        tail500x: number;
        tail1000x: number;
    };
    percentiles: StandardPercentiles;
    tailBuckets: TailBuckets;
    histogram: {
        bins: {
            label: string;
            count: number;
            percentage: number;
            rtpContribution: number;
        }[];
    };
    topWins: {
        rank: number;
        winX: number;
        spinIndex: number;
    }[];
    paytable: {
        symbols: {
            id: string;
            name: string;
            tier: string;
            pays: {
                count: number;
                value: number;
            }[];
        }[];
        scatter: {
            count: number;
            pay: number;
            freeSpins: number;
        }[];
        holdAndWin: {
            orbValues: {
                type: string;
                multiplier: number;
                weight: number;
            }[];
            expectedOrbValue: number;
        };
    };
    reels: {
        base: {
            reelIndex: number;
            length: number;
            symbolCounts: {
                symbol: string;
                count: number;
            }[];
        }[];
        freeSpins: {
            reelIndex: number;
            length: number;
            symbolCounts: {
                symbol: string;
                count: number;
            }[];
        }[];
    };
    tuningHints: TuningHint[];
    mathLockChecklist: MathLockChecklist;
}
export declare function generateSimReport(stats: SimulationStatistics, args: CLIArgs, elapsedMs: number, spinsPerSecond: number): SimReport;
export declare function generatePARCsv(stats: SimulationStatistics, args: CLIArgs): string;
export declare function generateOutputPath(args: CLIArgs): string;
export declare function saveReports(stats: SimulationStatistics, args: CLIArgs, elapsedMs: number, spinsPerSecond: number): {
    reportPath: string;
    parPath: string;
    configPath: string;
};
//# sourceMappingURL=reporter.d.ts.map