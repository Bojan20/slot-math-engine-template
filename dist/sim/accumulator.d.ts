/**
 * SLOT MATH ENGINE TEMPLATE - Streaming Statistics Accumulator
 *
 * Collects statistics without storing individual wins.
 * Uses HDR Histogram for precise tail percentiles.
 * Uses bigint for sumWinSq to prevent overflow at >1B spins.
 * Supports merging from multiple workers for parallel simulation.
 */
import { StandardPercentiles, TailBuckets } from '../utils/histogram.js';
export interface HistogramBin {
    min: number;
    max: number;
    label: string;
    count: number;
    rtpContribution: number;
}
export interface TopWin {
    winX: number;
    spinIndex: number;
    workerIndex: number;
}
export interface AccumulatorData {
    spinCount: number;
    totalWagered: number;
    totalWin: number;
    hitCount: number;
    sumWinSq: number;
    sumWinSqBigInt?: string;
    maxWinObserved: number;
    maxWinSpinIndex: number;
    fsTriggerCount: number;
    fsSpinsTotal: number;
    fsWinTotal: number;
    fsRetriggerCount: number;
    fsMaxMultiplier: number;
    hnwTriggerCount: number;
    hnwOrbsTotal: number;
    hnwWinTotal: number;
    hnwRespinsTotal: number;
    hnwFullGridJackpots: number;
    baseLineWin: number;
    scatterWin: number;
    fsWin: number;
    hnwWin: number;
    histogram: number[];
    histogramRtp: number[];
    topWins: TopWin[];
    hdrHistogramBase64?: string;
}
export declare const HISTOGRAM_BINS: {
    min: number;
    max: number;
    label: string;
}[];
export declare class StatsAccumulator {
    private data;
    private workerIndex;
    private bet;
    private hdrHistogram;
    private sumWinSqBigInt;
    constructor(bet?: number, workerIndex?: number);
    private createEmpty;
    /**
     * Record a base game spin result (v7)
     */
    recordBaseSpin(lineWin: number, scatterWin: number, multiplier: number, triggeredFS: boolean, triggeredHnW: boolean): void;
    /**
     * Record a free spins session result (v7)
     */
    recordFreeSpinsSession(totalFSWin: number, spinsPlayed: number, retriggerCount: number, baseScatterWin: number, maxMultiplier: number): void;
    /**
     * Record a Hold & Win session result
     */
    recordHnWSession(totalHnWWin: number, orbCount: number, respins: number, fullGridJackpot: boolean): void;
    /**
     * Record a win and update all statistics
     */
    private recordWin;
    /**
     * Get histogram bin index for a win multiplier
     */
    private getBinIndex;
    /**
     * Update top wins list (maintains top N wins)
     */
    private updateTopWins;
    /**
     * Get accumulated data for merging
     */
    getData(): AccumulatorData;
    /**
     * Merge another accumulator's data into this one (v7)
     */
    merge(other: AccumulatorData): void;
    /**
     * Calculate final statistics (v7)
     */
    getStatistics(): SimulationStatistics;
}
/**
 * Simulation statistics interface
 */
export interface SimulationStatistics {
    spinCount: number;
    totalWagered: number;
    totalWin: number;
    rtp: {
        total: number;
        base: number;
        scatter: number;
        freeSpins: number;
        holdAndWin: number;
        ci95Low: number;
        ci95High: number;
        ci95Margin: number;
    };
    hitRate: number;
    deadSpinRate: number;
    avgWinOnHit: number;
    freeSpins: {
        triggerRate: number;
        avgSpins: number;
        avgWin: number;
        retriggerRate: number;
        totalTriggers: number;
        totalSpins: number;
        maxMultiplier: number;
    };
    holdAndWin: {
        frequency: number;
        avgOrbs: number;
        avgWin: number;
        fullGridJackpotRate: number;
        totalTriggers: number;
    };
    volatility: {
        stdDev: number;
        variance: number;
        index: number;
        class: 'Low' | 'Medium' | 'High' | 'Very High';
    };
    extremes: {
        maxWin: number;
        maxWinSpinIndex: number;
        tail100x: number;
        tail500x: number;
        tail1000x: number;
    };
    percentiles: StandardPercentiles;
    tailBuckets: TailBuckets;
    histogram: HistogramBin[];
    topWins: TopWin[];
}
//# sourceMappingURL=accumulator.d.ts.map