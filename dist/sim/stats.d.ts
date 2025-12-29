/**
 * SLOT MATH ENGINE TEMPLATE - Statistics Tracker
 *
 * Streaming statistics collection for simulation.
 * Memory efficient - no large arrays, uses online algorithms.
 *
 * Tracks:
 * - RTP components (base, scatter, FS, H&W)
 * - Hit rates and frequencies
 * - Win distribution histogram
 * - Variance and std dev (Welford's algorithm)
 * - H&W specific metrics (Full Grid Jackpot rate, avg orbs, etc.)
 */
/**
 * Histogram bin definition
 */
export interface HistogramBin {
    min: number;
    max: number;
    label: string;
    count: number;
    rtpContribution: number;
}
/**
 * Streaming statistics tracker
 */
export declare class SimulationStats {
    totalSpins: number;
    winningSpins: number;
    totalBet: number;
    totalWin: number;
    baseLineWin: number;
    baseScatterWin: number;
    freeSpinsWin: number;
    multiplierBoost: number;
    fsTriggers: number;
    totalFSSpins: number;
    fsRetriggers: number;
    hnwTriggers: number;
    hnwTotalWin: number;
    hnwTotalOrbs: number;
    hnwTotalRespins: number;
    hnwFullGridJackpots: number;
    maxMultiplierSeen: number;
    maxWin: number;
    maxWinSpin: number;
    private varianceM;
    private varianceS;
    histogram: HistogramBin[];
    wins100xPlus: number;
    wins500xPlus: number;
    wins1000xPlus: number;
    wins5000xPlus: number;
    currentDeadStreak: number;
    maxDeadStreak: number;
    deadStreakSum: number;
    deadStreakCount: number;
    /**
     * Record a base game spin result (v7)
     */
    recordBaseSpin(bet: number, lineWin: number, scatterWin: number, multiplier: number, _winBeforeMultiplier: number, totalWin: number, triggeredFS: boolean, triggeredHnW?: boolean): void;
    /**
     * Record Free Spins session result
     */
    recordFreeSpinsSession(totalFSWin: number, spinsPlayed: number, retriggersCount: number, bet: number): void;
    /**
     * Record Hold & Win session result
     */
    recordHnWSession(totalHnWWin: number, orbCount: number, respins: number, fullGridJackpot: boolean, bet: number): void;
    /**
     * Record a win for histogram and variance
     */
    private recordWin;
    /**
     * Get computed statistics (v7)
     */
    getResults(): SimulationResults;
    /**
     * Merge stats from another tracker (for parallel simulation)
     */
    merge(other: SimulationStats): void;
}
/**
 * Simulation results interface
 */
export interface SimulationResults {
    totalSpins: number;
    totalBet: number;
    totalWin: number;
    rtp: number;
    rtpPercent: number;
    rtp95CI: number;
    rtpBreakdown: {
        baseLine: number;
        scatter: number;
        freeSpins: number;
        holdAndWin: number;
    };
    hitRate: number;
    hitRatePercent: number;
    fsTriggers: number;
    fsFrequency: number;
    avgFSSpins: number;
    avgFSWin: number;
    fsRetriggerRate: number;
    hnwTriggers: number;
    hnwFrequency: number;
    avgHnWOrbs: number;
    avgHnWWin: number;
    fullGridJackpotRate: number;
    maxMultiplier: number;
    variance: number;
    stdDev: number;
    volatilityIndex: number;
    maxWin: number;
    maxWinSpin: number;
    wins100xPlusRate: number;
    wins500xPlusRate: number;
    wins1000xPlusRate: number;
    wins5000xPlusRate: number;
    deadSpinRate: number;
    avgDeadStreak: number;
    maxDeadStreak: number;
    histogram: Array<HistogramBin & {
        percentage: number;
    }>;
}
//# sourceMappingURL=stats.d.ts.map