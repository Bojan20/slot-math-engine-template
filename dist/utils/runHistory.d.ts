/**
 * SLOT MATH ENGINE TEMPLATE - Run History Registry
 *
 * JSON-based append-only log of all simulation runs.
 * Tracks:
 * - Run metadata (timestamp, duration, parameters)
 * - Results summary (RTP, hit rate, max win)
 * - Config hash (links to exact config used)
 * - Report path (for full details)
 *
 * File: out/run_history.json
 * Format: Array of RunEntry objects, most recent last
 */
/**
 * Single run entry in history
 */
export interface RunEntry {
    /** Unique run ID (timestamp-based) */
    runId: string;
    /** ISO timestamp when run started */
    startedAt: string;
    /** ISO timestamp when run completed */
    completedAt: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Simulation parameters */
    params: {
        spins: number;
        bet: number;
        seed: number;
        workers: number;
        mode: 'base' | 'fs' | 'full';
    };
    /** Results summary */
    results: {
        rtp: number;
        rtpCI95Low: number;
        rtpCI95High: number;
        hitRate: number;
        maxWin: number;
        volatilityClass: string;
    };
    /** Config identification */
    config: {
        hash: string;
        version: string;
    };
    /** Paths to generated files */
    files: {
        reportPath: string;
        parPath?: string;
    };
    /** Performance metrics */
    performance: {
        spinsPerSecond: number;
        peakMemoryMB?: number;
    };
    /** Optional notes */
    notes?: string;
}
/**
 * Run history file format
 */
export interface RunHistoryFile {
    schemaVersion: string;
    game: string;
    entries: RunEntry[];
}
/**
 * Generate unique run ID
 */
export declare function generateRunId(): string;
/**
 * Load existing run history or create new
 */
export declare function loadRunHistory(outDir: string): RunHistoryFile;
/**
 * Save run history
 */
export declare function saveRunHistory(outDir: string, history: RunHistoryFile): void;
/**
 * Add a new run entry
 */
export declare function addRunEntry(outDir: string, entry: RunEntry): void;
/**
 * Get recent runs
 */
export declare function getRecentRuns(outDir: string, count?: number): RunEntry[];
/**
 * Get runs by config hash
 */
export declare function getRunsByConfigHash(outDir: string, hash: string): RunEntry[];
/**
 * Get best run (highest RTP)
 */
export declare function getBestRun(outDir: string): RunEntry | null;
/**
 * Get runs summary statistics
 */
export declare function getRunsSummary(outDir: string): {
    totalRuns: number;
    totalSpins: number;
    avgRtp: number;
    rtpRange: {
        min: number;
        max: number;
    };
    configs: number;
};
/**
 * Create run entry from simulation result
 */
export declare function createRunEntry(startTime: Date, params: RunEntry['params'], results: RunEntry['results'], config: RunEntry['config'], files: RunEntry['files'], durationMs: number, spinsPerSecond: number): RunEntry;
/**
 * Format run entry for display
 */
export declare function formatRunEntry(entry: RunEntry): string;
/**
 * Print run history summary
 */
export declare function printRunHistorySummary(outDir: string): void;
//# sourceMappingURL=runHistory.d.ts.map