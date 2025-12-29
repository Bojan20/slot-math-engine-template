/**
 * SLOT MATH ENGINE TEMPLATE - HDR Histogram Wrapper
 *
 * Uses hdr-histogram-js for precise tail distribution tracking.
 * Critical for:
 * - Accurate P99, P99.9, P99.99 percentiles
 * - Tail weight analysis (100x, 500x, 1000x+ wins)
 * - Volatility curve generation
 * - Certification-grade precision
 *
 * HDR Histogram stores counts in logarithmic buckets,
 * providing O(1) percentile queries with configurable precision.
 */
/**
 * Standard percentiles for slot math analysis
 */
export interface StandardPercentiles {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    p99_9: number;
    p99_99: number;
}
/**
 * Tail bucket counts
 */
export interface TailBuckets {
    ge10x: number;
    ge50x: number;
    ge100x: number;
    ge200x: number;
    ge500x: number;
    ge1000x: number;
}
/**
 * Histogram export format for reports
 */
export interface HistogramExport {
    totalCount: number;
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    percentiles: StandardPercentiles;
    tailBuckets: TailBuckets;
    bins: {
        range: string;
        count: number;
        percentage: number;
    }[];
}
/**
 * Win Distribution Histogram
 *
 * Specialized for slot win tracking with decimal precision.
 * Stores wins as integers (x100) for HDR compatibility.
 */
export declare class WinHistogram {
    private histogram;
    private tailCounts;
    /**
     * Create histogram for win multiples
     * @param maxWin Maximum expected win (x bet)
     * @param precision Significant digits (1-5)
     */
    constructor(maxWin?: number, precision?: 1 | 2 | 3 | 4 | 5);
    /**
     * Record a win (in bet multiples)
     */
    record(winX: number): void;
    /**
     * Get percentile value (in bet multiples)
     */
    getPercentile(p: number): number;
    /**
     * Get standard percentiles
     */
    getStandardPercentiles(): StandardPercentiles;
    /**
     * Get tail bucket counts
     */
    getTailBuckets(): TailBuckets;
    /**
     * Get total count
     */
    get count(): number;
    /**
     * Get min value
     */
    get min(): number;
    /**
     * Get max value
     */
    get max(): number;
    /**
     * Get mean value
     */
    get mean(): number;
    /**
     * Get standard deviation
     */
    get stdDev(): number;
    /**
     * Reset histogram
     */
    reset(): void;
    /**
     * Merge another histogram into this one
     */
    merge(other: WinHistogram): void;
    /**
     * Serialize histogram for worker transfer
     * Uses JSON with essential stats (HDR encode may not be available in all builds)
     */
    serialize(): string;
    /**
     * Deserialize histogram from worker data
     * Creates a new histogram with tail counts for merging
     */
    static deserialize(serialized: string): WinHistogram;
    /**
     * Export histogram data for reports
     */
    export(): HistogramExport;
    /**
     * Get tail count at specific threshold
     */
    private getTailCountAt;
}
/**
 * Streaming statistics calculator with HDR histogram
 * For real-time percentile tracking during simulation
 */
export declare class StreamingStats {
    private histogram;
    private _sum;
    private _sumSquares;
    private _count;
    private _hits;
    constructor(maxWin?: number);
    /**
     * Add a sample
     */
    add(value: number): void;
    get count(): number;
    get sum(): number;
    get hits(): number;
    get hitRate(): number;
    get mean(): number;
    get variance(): number;
    get stdDev(): number;
    getPercentiles(): StandardPercentiles;
    getTailBuckets(): TailBuckets;
    getHistogram(): WinHistogram;
    /**
     * Merge with another stats instance
     */
    merge(other: StreamingStats): void;
    /**
     * Export full report data
     */
    export(): {
        count: number;
        hits: number;
        hitRate: number;
        sum: number;
        mean: number;
        variance: number;
        stdDev: number;
        histogram: HistogramExport;
    };
}
//# sourceMappingURL=histogram.d.ts.map