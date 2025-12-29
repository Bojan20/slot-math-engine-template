/**
 * SLOT MATH ENGINE TEMPLATE - Streaming Statistics Accumulator
 *
 * Collects statistics without storing individual wins.
 * Uses HDR Histogram for precise tail percentiles.
 * Uses bigint for sumWinSq to prevent overflow at >1B spins.
 * Supports merging from multiple workers for parallel simulation.
 */
import { WinHistogram } from '../utils/histogram.js';
import { BigIntSumSquared, calculateVarianceBigInt, BIGINT_SPIN_THRESHOLD } from '../utils/bigintStats.js';
// Histogram bin definitions (logarithmic scale)
export const HISTOGRAM_BINS = [
    { min: 0, max: 0, label: '0x (Dead)' },
    { min: 0.001, max: 0.1, label: '0-0.1x' },
    { min: 0.1, max: 0.2, label: '0.1-0.2x' },
    { min: 0.2, max: 0.5, label: '0.2-0.5x' },
    { min: 0.5, max: 1, label: '0.5-1x' },
    { min: 1, max: 2, label: '1-2x' },
    { min: 2, max: 5, label: '2-5x' },
    { min: 5, max: 10, label: '5-10x' },
    { min: 10, max: 20, label: '10-20x' },
    { min: 20, max: 50, label: '20-50x' },
    { min: 50, max: 100, label: '50-100x' },
    { min: 100, max: 200, label: '100-200x' },
    { min: 200, max: 500, label: '200-500x' },
    { min: 500, max: 1000, label: '500-1000x' },
    { min: 1000, max: 2000, label: '1000-2000x' },
    { min: 2000, max: 5000, label: '2000-5000x' },
    { min: 5000, max: Infinity, label: '5000x+' }
];
const TOP_WINS_SIZE = 50;
export class StatsAccumulator {
    data;
    workerIndex;
    bet;
    hdrHistogram;
    sumWinSqBigInt; // BigInt for overflow prevention
    constructor(bet = 1, workerIndex = 0) {
        this.bet = bet;
        this.workerIndex = workerIndex;
        this.data = this.createEmpty();
        this.hdrHistogram = new WinHistogram();
        this.sumWinSqBigInt = new BigIntSumSquared();
    }
    createEmpty() {
        return {
            spinCount: 0,
            totalWagered: 0,
            totalWin: 0,
            hitCount: 0,
            sumWinSq: 0,
            maxWinObserved: 0,
            maxWinSpinIndex: 0,
            // Free Spins
            fsTriggerCount: 0,
            fsSpinsTotal: 0,
            fsWinTotal: 0,
            fsRetriggerCount: 0,
            fsMaxMultiplier: 1,
            // Hold & Win
            hnwTriggerCount: 0,
            hnwOrbsTotal: 0,
            hnwWinTotal: 0,
            hnwRespinsTotal: 0,
            hnwFullGridJackpots: 0,
            // RTP breakdown
            baseLineWin: 0,
            scatterWin: 0,
            fsWin: 0,
            hnwWin: 0,
            histogram: new Array(HISTOGRAM_BINS.length).fill(0),
            histogramRtp: new Array(HISTOGRAM_BINS.length).fill(0),
            topWins: []
        };
    }
    /**
     * Record a base game spin result (v7)
     */
    recordBaseSpin(lineWin, scatterWin, multiplier, triggeredFS, triggeredHnW) {
        this.data.spinCount++;
        this.data.totalWagered += this.bet;
        const totalWin = (lineWin + scatterWin) * multiplier;
        // RTP breakdown
        this.data.baseLineWin += lineWin * multiplier;
        this.data.scatterWin += scatterWin * multiplier;
        if (triggeredFS) {
            this.data.fsTriggerCount++;
            // Don't record win yet - FS session will be recorded separately
            return;
        }
        if (triggeredHnW) {
            this.data.hnwTriggerCount++;
            // Base win still counts, H&W win added separately
            this.recordWin(totalWin);
            return;
        }
        // Record the total win
        this.recordWin(totalWin);
    }
    /**
     * Record a free spins session result (v7)
     */
    recordFreeSpinsSession(totalFSWin, spinsPlayed, retriggerCount, baseScatterWin, maxMultiplier) {
        this.data.fsSpinsTotal += spinsPlayed;
        this.data.fsWinTotal += totalFSWin;
        this.data.fsRetriggerCount += retriggerCount;
        this.data.fsWin += totalFSWin;
        if (maxMultiplier > this.data.fsMaxMultiplier) {
            this.data.fsMaxMultiplier = maxMultiplier;
        }
        // Record total win (scatter + FS wins)
        const totalWin = baseScatterWin + totalFSWin;
        this.recordWin(totalWin);
    }
    /**
     * Record a Hold & Win session result
     */
    recordHnWSession(totalHnWWin, orbCount, respins, fullGridJackpot) {
        this.data.hnwOrbsTotal += orbCount;
        this.data.hnwWinTotal += totalHnWWin;
        this.data.hnwRespinsTotal += respins;
        this.data.hnwWin += totalHnWWin;
        if (fullGridJackpot) {
            this.data.hnwFullGridJackpots++;
        }
        // Record H&W win
        this.recordWin(totalHnWWin);
    }
    /**
     * Record a win and update all statistics
     */
    recordWin(winAmount) {
        const winX = winAmount / this.bet;
        this.data.totalWin += winAmount;
        this.data.sumWinSq += winAmount * winAmount; // Legacy (may overflow at >1B spins)
        this.sumWinSqBigInt.add(winAmount); // BigInt (never overflows)
        if (winAmount > 0) {
            this.data.hitCount++;
        }
        // Update max win
        if (winX > this.data.maxWinObserved) {
            this.data.maxWinObserved = winX;
            this.data.maxWinSpinIndex = this.data.spinCount;
        }
        // Update histogram (both legacy bins and HDR)
        const binIndex = this.getBinIndex(winX);
        this.data.histogram[binIndex]++;
        this.data.histogramRtp[binIndex] += winAmount;
        // Record in HDR histogram for precise percentiles
        this.hdrHistogram.record(winX);
        // Update top wins (min-heap)
        this.updateTopWins(winX, this.data.spinCount);
    }
    /**
     * Get histogram bin index for a win multiplier
     */
    getBinIndex(winX) {
        if (winX === 0)
            return 0;
        for (let i = 1; i < HISTOGRAM_BINS.length; i++) {
            const bin = HISTOGRAM_BINS[i];
            if (winX > bin.min && winX <= bin.max) {
                return i;
            }
        }
        return HISTOGRAM_BINS.length - 1; // 5000x+
    }
    /**
     * Update top wins list (maintains top N wins)
     */
    updateTopWins(winX, spinIndex) {
        const newWin = {
            winX,
            spinIndex,
            workerIndex: this.workerIndex
        };
        if (this.data.topWins.length < TOP_WINS_SIZE) {
            this.data.topWins.push(newWin);
            this.data.topWins.sort((a, b) => b.winX - a.winX);
        }
        else if (winX > this.data.topWins[TOP_WINS_SIZE - 1].winX) {
            this.data.topWins[TOP_WINS_SIZE - 1] = newWin;
            this.data.topWins.sort((a, b) => b.winX - a.winX);
        }
    }
    /**
     * Get accumulated data for merging
     */
    getData() {
        return {
            ...this.data,
            sumWinSqBigInt: this.sumWinSqBigInt.serialize(),
            hdrHistogramBase64: this.hdrHistogram.serialize()
        };
    }
    /**
     * Merge another accumulator's data into this one (v7)
     */
    merge(other) {
        this.data.spinCount += other.spinCount;
        this.data.totalWagered += other.totalWagered;
        this.data.totalWin += other.totalWin;
        this.data.hitCount += other.hitCount;
        this.data.sumWinSq += other.sumWinSq;
        // Merge bigint sum of squares
        if (other.sumWinSqBigInt) {
            const otherBigInt = BigIntSumSquared.deserialize(other.sumWinSqBigInt);
            this.sumWinSqBigInt.merge(otherBigInt);
        }
        if (other.maxWinObserved > this.data.maxWinObserved) {
            this.data.maxWinObserved = other.maxWinObserved;
            this.data.maxWinSpinIndex = other.maxWinSpinIndex;
        }
        // Free Spins
        this.data.fsTriggerCount += other.fsTriggerCount;
        this.data.fsSpinsTotal += other.fsSpinsTotal;
        this.data.fsWinTotal += other.fsWinTotal;
        this.data.fsRetriggerCount += other.fsRetriggerCount;
        this.data.fsMaxMultiplier = Math.max(this.data.fsMaxMultiplier, other.fsMaxMultiplier);
        // Hold & Win
        this.data.hnwTriggerCount += other.hnwTriggerCount;
        this.data.hnwOrbsTotal += other.hnwOrbsTotal;
        this.data.hnwWinTotal += other.hnwWinTotal;
        this.data.hnwRespinsTotal += other.hnwRespinsTotal;
        this.data.hnwFullGridJackpots += other.hnwFullGridJackpots;
        // RTP breakdown
        this.data.baseLineWin += other.baseLineWin;
        this.data.scatterWin += other.scatterWin;
        this.data.fsWin += other.fsWin;
        this.data.hnwWin += other.hnwWin;
        // Merge histograms
        for (let i = 0; i < HISTOGRAM_BINS.length; i++) {
            this.data.histogram[i] += other.histogram[i];
            this.data.histogramRtp[i] += other.histogramRtp[i];
        }
        // Merge top wins
        const allTopWins = [...this.data.topWins, ...other.topWins];
        allTopWins.sort((a, b) => b.winX - a.winX);
        this.data.topWins = allTopWins.slice(0, TOP_WINS_SIZE);
        // Merge HDR histograms
        if (other.hdrHistogramBase64) {
            const otherHdr = WinHistogram.deserialize(other.hdrHistogramBase64);
            this.hdrHistogram.merge(otherHdr);
        }
    }
    /**
     * Calculate final statistics (v7)
     */
    getStatistics() {
        const d = this.data;
        // RTP calculations
        const rtp = d.totalWin / d.totalWagered;
        const baseRtp = d.baseLineWin / d.totalWagered;
        const scatterRtp = d.scatterWin / d.totalWagered;
        const fsRtp = d.fsWin / d.totalWagered;
        const hnwRtp = d.hnwWin / d.totalWagered;
        // Variance and standard deviation
        const meanWin = d.totalWin / d.spinCount;
        let variance;
        if (d.spinCount >= BIGINT_SPIN_THRESHOLD) {
            variance = calculateVarianceBigInt(this.sumWinSqBigInt.getValue(), d.totalWin, d.spinCount);
        }
        else {
            variance = (d.sumWinSq / d.spinCount) - (meanWin * meanWin);
        }
        const stdDev = Math.sqrt(Math.max(0, variance));
        // Confidence interval (95%)
        const standardError = stdDev / Math.sqrt(d.spinCount);
        const ci95 = 1.96 * standardError / this.bet;
        // Hit rate and dead spin rate
        const hitRate = d.hitCount / d.spinCount;
        const deadSpinRate = 1 - hitRate;
        // Free Spins rates
        const fsTriggerRate = d.fsTriggerCount > 0 ? d.spinCount / d.fsTriggerCount : Infinity;
        const avgFsSpins = d.fsTriggerCount > 0 ? d.fsSpinsTotal / d.fsTriggerCount : 0;
        const avgFsWin = d.fsTriggerCount > 0 ? d.fsWinTotal / d.fsTriggerCount / this.bet : 0;
        const fsRetriggerRate = d.fsTriggerCount > 0 ? d.fsRetriggerCount / d.fsTriggerCount : 0;
        // Hold & Win rates
        const hnwFrequency = d.hnwTriggerCount > 0 ? d.spinCount / d.hnwTriggerCount : Infinity;
        const avgHnwOrbs = d.hnwTriggerCount > 0 ? d.hnwOrbsTotal / d.hnwTriggerCount : 0;
        const avgHnwWin = d.hnwTriggerCount > 0 ? d.hnwWinTotal / d.hnwTriggerCount / this.bet : 0;
        const fullGridJackpotRate = d.hnwTriggerCount > 0 ? d.hnwFullGridJackpots / d.hnwTriggerCount : 0;
        // Volatility index
        const volatilityIndex = stdDev / this.bet;
        let volatilityClass;
        if (volatilityIndex < 5)
            volatilityClass = 'Low';
        else if (volatilityIndex < 10)
            volatilityClass = 'Medium';
        else if (volatilityIndex < 20)
            volatilityClass = 'High';
        else
            volatilityClass = 'Very High';
        // Tail statistics
        const tail100x = d.histogram.slice(11).reduce((a, b) => a + b, 0) / d.spinCount;
        const tail500x = d.histogram.slice(13).reduce((a, b) => a + b, 0) / d.spinCount;
        const tail1000x = d.histogram.slice(14).reduce((a, b) => a + b, 0) / d.spinCount;
        // Build histogram with RTP contributions
        const histogram = HISTOGRAM_BINS.map((bin, i) => ({
            ...bin,
            count: d.histogram[i],
            rtpContribution: (d.histogramRtp[i] / d.totalWagered) * 100
        }));
        return {
            spinCount: d.spinCount,
            totalWagered: d.totalWagered,
            totalWin: d.totalWin,
            rtp: {
                total: rtp * 100,
                base: baseRtp * 100,
                scatter: scatterRtp * 100,
                freeSpins: fsRtp * 100,
                holdAndWin: hnwRtp * 100,
                ci95Low: (rtp - ci95) * 100,
                ci95High: (rtp + ci95) * 100,
                ci95Margin: ci95 * 100
            },
            hitRate: hitRate * 100,
            deadSpinRate: deadSpinRate * 100,
            avgWinOnHit: d.hitCount > 0 ? d.totalWin / d.hitCount / this.bet : 0,
            freeSpins: {
                triggerRate: fsTriggerRate,
                avgSpins: avgFsSpins,
                avgWin: avgFsWin,
                retriggerRate: fsRetriggerRate * 100,
                totalTriggers: d.fsTriggerCount,
                totalSpins: d.fsSpinsTotal,
                maxMultiplier: d.fsMaxMultiplier
            },
            holdAndWin: {
                frequency: hnwFrequency,
                avgOrbs: avgHnwOrbs,
                avgWin: avgHnwWin,
                fullGridJackpotRate: fullGridJackpotRate * 100,
                totalTriggers: d.hnwTriggerCount
            },
            volatility: {
                stdDev,
                variance,
                index: volatilityIndex,
                class: volatilityClass
            },
            extremes: {
                maxWin: d.maxWinObserved,
                maxWinSpinIndex: d.maxWinSpinIndex,
                tail100x: tail100x * 100,
                tail500x: tail500x * 100,
                tail1000x: tail1000x * 100
            },
            // HDR percentiles
            percentiles: this.hdrHistogram.getStandardPercentiles(),
            tailBuckets: this.hdrHistogram.getTailBuckets(),
            histogram,
            topWins: d.topWins
        };
    }
}
//# sourceMappingURL=accumulator.js.map