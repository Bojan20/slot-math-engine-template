/**
 * SLOT MATH ENGINE TEMPLATE - PAR Sheet Report Generator
 *
 * Generates:
 * 1. SimReport.json - Complete machine-readable report
 * 2. PAR.csv - Excel-friendly summary
 * 3. Console summary - Human readable quick view
 */
import { SimulationResults } from '../sim/stats.js';
/**
 * SimReport.json structure (v7)
 */
export interface SimReport {
    schemaVersion: string;
    generatedAt: string;
    configHash: string;
    game: {
        name: string;
        version: string;
        mathVersion: string;
        layout: string;
        paySystem: string;
        paylines: number;
        targetRTP: number;
        targetVolatility: string;
        maxWin: number;
    };
    simulation: {
        spins: number;
        seed?: number;
        engineVersion: string;
    };
    results: {
        observedRTP: number;
        rtpPercent: number;
        errorMargin: number;
        ci95Lower: number;
        ci95Upper: number;
        rtpBreakdown: {
            baseLine: number;
            scatter: number;
            freeSpins: number;
            holdAndWin: number;
        };
        hitRate: number;
        deadSpinRate: number;
        avgWinOnHit: number;
        percentiles: {
            p50: number;
            p90: number;
            p99: number;
            p999: number;
        };
        tailBuckets: {
            ge100x: number;
            ge500x: number;
            ge1000x: number;
            ge5000x: number;
        };
        maxObservedWin: number;
        maxWinSpin: number;
    };
    features: Array<{
        id: string;
        name: string;
        triggerRate: number;
        frequency: string;
        avgWin: number;
        rtpContribution: number;
        additionalMetrics?: Record<string, number | string>;
    }>;
    volatility: {
        variance: number;
        stdDev: number;
        volatilityIndex: number;
        classification: string;
    };
    streaks: {
        deadMean: number;
        deadMax: number;
    };
    histogram: Array<{
        bucket: string;
        count: number;
        percentage: number;
        rtpContribution: number;
    }>;
    reelStrips: {
        base: Array<{
            reel: number;
            length: number;
            distribution: Array<{
                symbol: string;
                count: number;
                percentage: number;
            }>;
        }>;
        freeSpins: Array<{
            reel: number;
            length: number;
            distribution: Array<{
                symbol: string;
                count: number;
                percentage: number;
            }>;
        }>;
    };
    paytable: {
        lineWins: Array<{
            symbol: string;
            pays: {
                3: number;
                4: number;
                5: number;
            };
        }>;
        scatter: Array<{
            count: number;
            pay: number;
            freeSpins: number;
        }>;
        holdAndWin: {
            orbValues: Array<{
                type: string;
                multiplier: number;
                weight: number;
            }>;
            expectedOrbValue: number;
        };
    };
    notes: string[];
}
/**
 * Generate SimReport.json (v7)
 */
export declare function generateSimReport(results: SimulationResults, seed?: number): SimReport;
/**
 * Generate PAR.csv (v7)
 */
export declare function generatePARCSV(results: SimulationResults): string;
/**
 * Print console summary (v7)
 */
export declare function printConsoleSummary(results: SimulationResults): void;
/**
 * Save reports to files
 */
export declare function saveReports(results: SimulationResults, outDir: string, seed?: number): Promise<void>;
//# sourceMappingURL=parReport.d.ts.map