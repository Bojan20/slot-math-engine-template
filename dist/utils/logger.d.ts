/**
 * SLOT MATH ENGINE TEMPLATE - Lightweight Logger
 *
 * Simple, colored logger for CLI output.
 * Features:
 * - Colored output for different levels
 * - Timestamp support
 * - Rate limiting to prevent spam in tight loops
 * - Silent mode for tests
 *
 * This is intentionally lightweight - no external dependencies.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';
interface LoggerConfig {
    level: LogLevel;
    silent: boolean;
    timestamps: boolean;
    colors: boolean;
}
declare class Logger {
    private config;
    private lastProgressLog;
    private progressRateLimitMs;
    /**
     * Configure logger
     */
    configure(config: Partial<LoggerConfig>): void;
    /**
     * Set log level
     */
    setLevel(level: LogLevel): void;
    /**
     * Enable/disable silent mode
     */
    setSilent(silent: boolean): void;
    /**
     * Enable/disable timestamps
     */
    setTimestamps(enabled: boolean): void;
    /**
     * Check if level should be logged
     */
    private shouldLog;
    /**
     * Format message with colors and timestamp
     */
    private format;
    /**
     * Debug level log
     */
    debug(message: string, ...args: unknown[]): void;
    /**
     * Info level log
     */
    info(message: string, ...args: unknown[]): void;
    /**
     * Warning level log
     */
    warn(message: string, ...args: unknown[]): void;
    /**
     * Error level log
     */
    error(message: string, ...args: unknown[]): void;
    /**
     * Success level log
     */
    success(message: string, ...args: unknown[]): void;
    /**
     * Rate-limited progress log (won't spam in tight loops)
     */
    progress(message: string): void;
    /**
     * End progress line (move to new line)
     */
    progressEnd(): void;
    /**
     * Log a divider line
     */
    divider(char?: string, length?: number): void;
    /**
     * Log a header
     */
    header(title: string): void;
    /**
     * Log a section
     */
    section(title: string): void;
    /**
     * Log key-value pair
     */
    kv(key: string, value: unknown, indent?: number): void;
    /**
     * Log a table row
     */
    row(columns: (string | number)[], widths: number[]): void;
    /**
     * Highlight a value
     */
    highlight(value: string | number): string;
    /**
     * Format number with color based on range
     */
    colorNumber(value: number, good: [number, number], warn: [number, number]): string;
    /**
     * Format RTP with appropriate color
     */
    formatRTP(rtp: number, target?: number): string;
}
export declare const logger: Logger;
export { Logger };
//# sourceMappingURL=logger.d.ts.map