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
// ANSI color codes
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    // Foreground
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    // Background
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    success: 1 // Same as info
};
const LEVEL_COLORS = {
    debug: COLORS.gray,
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red,
    success: COLORS.green
};
const LEVEL_LABELS = {
    debug: 'DEBUG',
    info: 'INFO ',
    warn: 'WARN ',
    error: 'ERROR',
    success: '  OK '
};
class Logger {
    config = {
        level: 'info',
        silent: false,
        timestamps: false,
        colors: true
    };
    // Rate limiting for progress logs
    lastProgressLog = 0;
    progressRateLimitMs = 100;
    /**
     * Configure logger
     */
    configure(config) {
        Object.assign(this.config, config);
    }
    /**
     * Set log level
     */
    setLevel(level) {
        this.config.level = level;
    }
    /**
     * Enable/disable silent mode
     */
    setSilent(silent) {
        this.config.silent = silent;
    }
    /**
     * Enable/disable timestamps
     */
    setTimestamps(enabled) {
        this.config.timestamps = enabled;
    }
    /**
     * Check if level should be logged
     */
    shouldLog(level) {
        if (this.config.silent)
            return false;
        return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
    }
    /**
     * Format message with colors and timestamp
     */
    format(level, message) {
        const parts = [];
        // Timestamp
        if (this.config.timestamps) {
            const now = new Date().toISOString().substr(11, 12);
            parts.push(this.config.colors ? `${COLORS.gray}[${now}]${COLORS.reset}` : `[${now}]`);
        }
        // Level label
        const label = LEVEL_LABELS[level];
        if (this.config.colors) {
            parts.push(`${LEVEL_COLORS[level]}${label}${COLORS.reset}`);
        }
        else {
            parts.push(label);
        }
        // Message
        parts.push(message);
        return parts.join(' ');
    }
    /**
     * Debug level log
     */
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.log(this.format('debug', message), ...args);
        }
    }
    /**
     * Info level log
     */
    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.log(this.format('info', message), ...args);
        }
    }
    /**
     * Warning level log
     */
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(this.format('warn', message), ...args);
        }
    }
    /**
     * Error level log
     */
    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(this.format('error', message), ...args);
        }
    }
    /**
     * Success level log
     */
    success(message, ...args) {
        if (this.shouldLog('success')) {
            console.log(this.format('success', message), ...args);
        }
    }
    /**
     * Rate-limited progress log (won't spam in tight loops)
     */
    progress(message) {
        const now = Date.now();
        if (now - this.lastProgressLog >= this.progressRateLimitMs) {
            this.lastProgressLog = now;
            if (this.shouldLog('info')) {
                // Use carriage return to overwrite line
                process.stdout.write(`\r${this.format('info', message)}   `);
            }
        }
    }
    /**
     * End progress line (move to new line)
     */
    progressEnd() {
        if (!this.config.silent) {
            process.stdout.write('\n');
        }
    }
    /**
     * Log a divider line
     */
    divider(char = '─', length = 60) {
        if (this.shouldLog('info')) {
            const line = char.repeat(length);
            console.log(this.config.colors ? `${COLORS.gray}${line}${COLORS.reset}` : line);
        }
    }
    /**
     * Log a header
     */
    header(title) {
        if (this.shouldLog('info')) {
            this.divider('═');
            const formatted = this.config.colors
                ? `${COLORS.bright}${COLORS.cyan}${title}${COLORS.reset}`
                : title;
            console.log(formatted);
            this.divider('═');
        }
    }
    /**
     * Log a section
     */
    section(title) {
        if (this.shouldLog('info')) {
            console.log();
            const formatted = this.config.colors
                ? `${COLORS.bright}${title}${COLORS.reset}`
                : title;
            console.log(formatted);
            this.divider('─', 40);
        }
    }
    /**
     * Log key-value pair
     */
    kv(key, value, indent = 0) {
        if (this.shouldLog('info')) {
            const spaces = ' '.repeat(indent);
            const formattedKey = this.config.colors
                ? `${COLORS.gray}${key}:${COLORS.reset}`
                : `${key}:`;
            console.log(`${spaces}${formattedKey} ${value}`);
        }
    }
    /**
     * Log a table row
     */
    row(columns, widths) {
        if (this.shouldLog('info')) {
            const formatted = columns.map((col, i) => {
                const str = String(col);
                const width = widths[i] || str.length;
                return str.padEnd(width);
            }).join(' ');
            console.log(formatted);
        }
    }
    /**
     * Highlight a value
     */
    highlight(value) {
        if (this.config.colors) {
            return `${COLORS.bright}${COLORS.cyan}${value}${COLORS.reset}`;
        }
        return String(value);
    }
    /**
     * Format number with color based on range
     */
    colorNumber(value, good, warn) {
        if (!this.config.colors)
            return String(value);
        if (value >= good[0] && value <= good[1]) {
            return `${COLORS.green}${value}${COLORS.reset}`;
        }
        else if (value >= warn[0] && value <= warn[1]) {
            return `${COLORS.yellow}${value}${COLORS.reset}`;
        }
        else {
            return `${COLORS.red}${value}${COLORS.reset}`;
        }
    }
    /**
     * Format RTP with appropriate color
     */
    formatRTP(rtp, target = 0.96) {
        const rtpPct = (rtp * 100).toFixed(4) + '%';
        const diff = Math.abs(rtp - target);
        if (!this.config.colors)
            return rtpPct;
        if (diff < 0.001) {
            return `${COLORS.green}${rtpPct}${COLORS.reset}`;
        }
        else if (diff < 0.005) {
            return `${COLORS.yellow}${rtpPct}${COLORS.reset}`;
        }
        else {
            return `${COLORS.red}${rtpPct}${COLORS.reset}`;
        }
    }
}
// Export singleton instance
export const logger = new Logger();
// Export class for custom instances
export { Logger };
//# sourceMappingURL=logger.js.map