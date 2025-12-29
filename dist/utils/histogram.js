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
import hdr from 'hdr-histogram-js';
/**
 * Win Distribution Histogram
 *
 * Specialized for slot win tracking with decimal precision.
 * Stores wins as integers (x100) for HDR compatibility.
 */
export class WinHistogram {
    histogram;
    tailCounts = {
        ge10x: 0,
        ge50x: 0,
        ge100x: 0,
        ge200x: 0,
        ge500x: 0,
        ge1000x: 0
    };
    /**
     * Create histogram for win multiples
     * @param maxWin Maximum expected win (x bet)
     * @param precision Significant digits (1-5)
     */
    constructor(maxWin = 100000, precision = 3) {
        this.histogram = hdr.build({
            lowestDiscernibleValue: 1,
            highestTrackableValue: Math.round(maxWin * 100) + 1,
            numberOfSignificantValueDigits: precision
        });
    }
    /**
     * Record a win (in bet multiples)
     */
    record(winX) {
        // HDR needs positive integers, store as x100 for 2 decimal precision
        const hdrValue = Math.max(1, Math.round(winX * 100));
        this.histogram.recordValue(hdrValue);
        // Track tail buckets
        if (winX >= 10)
            this.tailCounts.ge10x++;
        if (winX >= 50)
            this.tailCounts.ge50x++;
        if (winX >= 100)
            this.tailCounts.ge100x++;
        if (winX >= 200)
            this.tailCounts.ge200x++;
        if (winX >= 500)
            this.tailCounts.ge500x++;
        if (winX >= 1000)
            this.tailCounts.ge1000x++;
    }
    /**
     * Get percentile value (in bet multiples)
     */
    getPercentile(p) {
        const hdrValue = this.histogram.getValueAtPercentile(p);
        return hdrValue / 100;
    }
    /**
     * Get standard percentiles
     */
    getStandardPercentiles() {
        return {
            p50: this.getPercentile(50),
            p75: this.getPercentile(75),
            p90: this.getPercentile(90),
            p95: this.getPercentile(95),
            p99: this.getPercentile(99),
            p99_9: this.getPercentile(99.9),
            p99_99: this.getPercentile(99.99)
        };
    }
    /**
     * Get tail bucket counts
     */
    getTailBuckets() {
        return { ...this.tailCounts };
    }
    /**
     * Get total count
     */
    get count() {
        return this.histogram.totalCount;
    }
    /**
     * Get min value
     */
    get min() {
        return this.histogram.minNonZeroValue / 100;
    }
    /**
     * Get max value
     */
    get max() {
        return this.histogram.maxValue / 100;
    }
    /**
     * Get mean value
     */
    get mean() {
        return this.histogram.mean / 100;
    }
    /**
     * Get standard deviation
     */
    get stdDev() {
        return this.histogram.stdDeviation / 100;
    }
    /**
     * Reset histogram
     */
    reset() {
        this.histogram.reset();
        this.tailCounts = {
            ge10x: 0,
            ge50x: 0,
            ge100x: 0,
            ge200x: 0,
            ge500x: 0,
            ge1000x: 0
        };
    }
    /**
     * Merge another histogram into this one
     */
    merge(other) {
        this.histogram.add(other.histogram);
        this.tailCounts.ge10x += other.tailCounts.ge10x;
        this.tailCounts.ge50x += other.tailCounts.ge50x;
        this.tailCounts.ge100x += other.tailCounts.ge100x;
        this.tailCounts.ge200x += other.tailCounts.ge200x;
        this.tailCounts.ge500x += other.tailCounts.ge500x;
        this.tailCounts.ge1000x += other.tailCounts.ge1000x;
    }
    /**
     * Serialize histogram for worker transfer
     * Uses JSON with essential stats (HDR encode may not be available in all builds)
     */
    serialize() {
        const data = {
            percentiles: this.getStandardPercentiles(),
            count: this.histogram.totalCount,
            tailCounts: this.tailCounts
        };
        return JSON.stringify(data);
    }
    /**
     * Deserialize histogram from worker data
     * Creates a new histogram with tail counts for merging
     */
    static deserialize(serialized) {
        const data = JSON.parse(serialized);
        const instance = new WinHistogram();
        // Restore tail counts - this is what we need for merging
        instance.tailCounts = data.tailCounts;
        return instance;
    }
    /**
     * Export histogram data for reports
     */
    export() {
        const total = this.count;
        // Create logarithmic bins for visualization using percentile-based approximation
        const binEdges = [0, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, Infinity];
        const bins = [];
        // Get cumulative counts at bin edges using getValueAtPercentile inverse
        for (let i = 0; i < binEdges.length - 1; i++) {
            const low = binEdges[i];
            const high = binEdges[i + 1];
            const range = high === Infinity ? `${low}x+` : `${low}x-${high}x`;
            // Approximate count using percentile interpolation
            // HDR doesn't expose direct count queries, so use tail buckets where available
            let count = 0;
            if (i === binEdges.length - 2) {
                // Last bin (1000x+)
                count = this.tailCounts.ge1000x;
            }
            else {
                // Estimate from tail differences
                const tailCount = this.getTailCountAt(low);
                const nextTailCount = this.getTailCountAt(high);
                count = Math.max(0, tailCount - nextTailCount);
            }
            bins.push({
                range,
                count,
                percentage: total > 0 ? (count / total) * 100 : 0
            });
        }
        return {
            totalCount: total,
            min: this.min,
            max: this.max,
            mean: this.mean,
            stdDev: this.stdDev,
            percentiles: this.getStandardPercentiles(),
            tailBuckets: this.getTailBuckets(),
            bins
        };
    }
    /**
     * Get tail count at specific threshold
     */
    getTailCountAt(threshold) {
        if (threshold >= 1000)
            return this.tailCounts.ge1000x;
        if (threshold >= 500)
            return this.tailCounts.ge500x;
        if (threshold >= 200)
            return this.tailCounts.ge200x;
        if (threshold >= 100)
            return this.tailCounts.ge100x;
        if (threshold >= 50)
            return this.tailCounts.ge50x;
        if (threshold >= 10)
            return this.tailCounts.ge10x;
        return this.count; // All values are >= 0
    }
}
/**
 * Streaming statistics calculator with HDR histogram
 * For real-time percentile tracking during simulation
 */
export class StreamingStats {
    histogram;
    _sum = 0;
    _sumSquares = 0;
    _count = 0;
    _hits = 0;
    constructor(maxWin = 100000) {
        this.histogram = new WinHistogram(maxWin);
    }
    /**
     * Add a sample
     */
    add(value) {
        this._count++;
        this._sum += value;
        this._sumSquares += value * value;
        if (value > 0) {
            this._hits++;
            this.histogram.record(value);
        }
    }
    get count() {
        return this._count;
    }
    get sum() {
        return this._sum;
    }
    get hits() {
        return this._hits;
    }
    get hitRate() {
        return this._count > 0 ? this._hits / this._count : 0;
    }
    get mean() {
        return this._count > 0 ? this._sum / this._count : 0;
    }
    get variance() {
        if (this._count < 2)
            return 0;
        const mean = this.mean;
        return (this._sumSquares / this._count) - (mean * mean);
    }
    get stdDev() {
        return Math.sqrt(Math.max(0, this.variance));
    }
    getPercentiles() {
        return this.histogram.getStandardPercentiles();
    }
    getTailBuckets() {
        return this.histogram.getTailBuckets();
    }
    getHistogram() {
        return this.histogram;
    }
    /**
     * Merge with another stats instance
     */
    merge(other) {
        this._count += other._count;
        this._sum += other._sum;
        this._sumSquares += other._sumSquares;
        this._hits += other._hits;
        this.histogram.merge(other.histogram);
    }
    /**
     * Export full report data
     */
    export() {
        return {
            count: this._count,
            hits: this._hits,
            hitRate: this.hitRate,
            sum: this._sum,
            mean: this.mean,
            variance: this.variance,
            stdDev: this.stdDev,
            histogram: this.histogram.export()
        };
    }
}
//# sourceMappingURL=histogram.js.map