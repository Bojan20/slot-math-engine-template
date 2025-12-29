/**
 * SLOT MATH ENGINE TEMPLATE - Commander CLI
 *
 * Professional CLI using commander for:
 * - Subcommands (sim, compare, lock, export)
 * - Automatic help generation
 * - Option validation
 * - Clean error handling
 */
import { Command } from 'commander';
import { cpus } from 'os';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';
const VERSION = '1.0.0';
const DEFAULT_SPINS = 20_000_000;
const DEFAULT_QUICK_SPINS = 1_000_000;
const DEFAULT_FULL_SPINS = 100_000_000;
/**
 * Create the CLI program
 */
export function createCLI() {
    const program = new Command();
    program
        .name('slot-math')
        .description('Slot Math Engine Template - Production Grade Simulator')
        .version(VERSION);
    // ─────────────────────────────────────────────────────────────────────────
    // SIM COMMAND
    // ─────────────────────────────────────────────────────────────────────────
    program
        .command('sim')
        .description('Run Monte Carlo simulation')
        .option('-s, --spins <number>', 'Number of spins to simulate', String(DEFAULT_SPINS))
        .option('-b, --bet <number>', 'Bet amount per spin', '1')
        .option('--seed <number>', 'RNG seed for reproducibility', '12345')
        .option('-w, --workers <number>', 'Number of worker threads', String(Math.max(1, cpus().length - 1)))
        .option('-m, --mode <mode>', 'Simulation mode (base/fs/full)', 'full')
        .option('-o, --out <path>', 'Output directory', './out')
        .option('-v, --verbose', 'Enable verbose logging', false)
        .option('--json', 'Output only JSON (for piping)', false)
        .option('--quick', 'Quick run (1M spins)', false)
        .option('--full', 'Full run (100M spins)', false)
        .action(async (opts) => {
        const options = parseSimOptions(opts);
        logger.setLevel(options.verbose ? 'debug' : 'info');
        if (!options.json) {
            printBanner();
            logger.info(`Starting simulation with ${options.spins.toLocaleString()} spins...`);
        }
        // Use existing parallel simulation
        const { runParallelSimulation } = await import('../sim/parallel.js');
        const { saveReports } = await import('../report/reporter.js');
        const result = await runParallelSimulation({
            totalSpins: options.spins,
            bet: options.bet,
            baseSeed: options.seed,
            workerCount: options.workers,
            mode: options.mode
        });
        // Save reports
        const { reportPath } = saveReports(result.statistics, {
            spins: options.spins,
            bet: options.bet,
            seed: options.seed,
            workers: options.workers,
            mode: options.mode,
            out: options.out,
            verbose: options.verbose,
            quick: false
        }, result.elapsedMs, result.spinsPerSecond);
        if (options.json) {
            console.log(JSON.stringify(result.statistics, null, 2));
        }
        else {
            logger.info(`Simulation complete. Report: ${reportPath}`);
            logger.info(`RTP: ${result.statistics.rtp.total.toFixed(4)}%`);
        }
    });
    // ─────────────────────────────────────────────────────────────────────────
    // COMPARE COMMAND
    // ─────────────────────────────────────────────────────────────────────────
    program
        .command('compare')
        .description('Compare two simulation reports')
        .argument('<report1>', 'First SimReport.json path')
        .argument('<report2>', 'Second SimReport.json path')
        .option('-o, --out <path>', 'Output comparison file', './out/comparison.json')
        .action(async (report1, report2, opts) => {
        const options = {
            report1: resolve(report1),
            report2: resolve(report2),
            out: resolve(opts.out)
        };
        logger.info('Comparing simulation reports...');
        // Run compare.ts directly (it's a standalone script)
        const { spawn } = await import('child_process');
        const compareScript = resolve(import.meta.dirname || '.', '../tools/compare.js');
        spawn('node', [compareScript, options.report1, options.report2], { stdio: 'inherit' });
    });
    // ─────────────────────────────────────────────────────────────────────────
    // LOCK COMMAND
    // ─────────────────────────────────────────────────────────────────────────
    program
        .command('lock')
        .description('Lock math configuration after verification')
        .argument('<report>', 'Verified SimReport.json path')
        .option('-f, --force', 'Force lock even with warnings', false)
        .action(async (report, opts) => {
        const options = {
            report: resolve(report),
            force: opts.force
        };
        logger.info('Verifying math lock checklist...');
        // Import and run lock
        const { runLockCLI } = await import('../tools/lock.js');
        await runLockCLI(options);
    });
    // ─────────────────────────────────────────────────────────────────────────
    // EXPORT COMMAND
    // ─────────────────────────────────────────────────────────────────────────
    program
        .command('export')
        .description('Export PAR sheet from simulation report')
        .argument('<report>', 'SimReport.json path')
        .option('-f, --format <format>', 'Export format (csv/json)', 'csv')
        .option('-o, --out <path>', 'Output file path', './out/PAR')
        .action(async (report, opts) => {
        const options = {
            report: resolve(report),
            format: opts.format,
            out: resolve(opts.out)
        };
        logger.info(`Exporting PAR sheet as ${options.format.toUpperCase()}...`);
        // Import and run export
        const { runExportCLI } = await import('../tools/export.js');
        await runExportCLI(options);
    });
    // ─────────────────────────────────────────────────────────────────────────
    // DEFAULT ACTION (same as sim)
    // ─────────────────────────────────────────────────────────────────────────
    program
        .option('-s, --spins <number>', 'Number of spins to simulate', String(DEFAULT_SPINS))
        .option('-b, --bet <number>', 'Bet amount per spin', '1')
        .option('--seed <number>', 'RNG seed for reproducibility', '12345')
        .option('-w, --workers <number>', 'Number of worker threads', String(Math.max(1, cpus().length - 1)))
        .option('-m, --mode <mode>', 'Simulation mode (base/fs/full)', 'full')
        .option('-o, --out <path>', 'Output directory', './out')
        .option('-v, --verbose', 'Enable verbose logging', false)
        .option('--json', 'Output only JSON (for piping)', false)
        .option('--quick', 'Quick run (1M spins)', false)
        .option('--full', 'Full run (100M spins)', false)
        .action(async (opts) => {
        // Default to sim command if no subcommand
        const options = parseSimOptions(opts);
        logger.setLevel(options.verbose ? 'debug' : 'info');
        if (!options.json) {
            printBanner();
            logger.info(`Starting simulation with ${options.spins.toLocaleString()} spins...`);
        }
        // Use existing parallel simulation
        const { runParallelSimulation } = await import('../sim/parallel.js');
        const { saveReports } = await import('../report/reporter.js');
        const result = await runParallelSimulation({
            totalSpins: options.spins,
            bet: options.bet,
            baseSeed: options.seed,
            workerCount: options.workers,
            mode: options.mode
        });
        // Save reports
        const { reportPath } = saveReports(result.statistics, {
            spins: options.spins,
            bet: options.bet,
            seed: options.seed,
            workers: options.workers,
            mode: options.mode,
            out: options.out,
            verbose: options.verbose,
            quick: false
        }, result.elapsedMs, result.spinsPerSecond);
        if (options.json) {
            console.log(JSON.stringify(result.statistics, null, 2));
        }
        else {
            logger.info(`Simulation complete. Report: ${reportPath}`);
            logger.info(`RTP: ${result.statistics.rtp.total.toFixed(4)}%`);
        }
    });
    return program;
}
/**
 * Parse sim options with validation
 */
function parseSimOptions(opts) {
    let spins = parseInt(opts.spins, 10);
    // Handle quick/full flags
    if (opts.quick) {
        spins = DEFAULT_QUICK_SPINS;
    }
    else if (opts.full) {
        spins = DEFAULT_FULL_SPINS;
    }
    const workers = parseInt(opts.workers, 10);
    const mode = opts.mode;
    // Validate mode
    if (!['base', 'fs', 'full'].includes(mode)) {
        logger.error(`Invalid mode: ${mode}. Must be one of: base, fs, full`);
        process.exit(1);
    }
    return {
        spins,
        bet: parseFloat(opts.bet),
        seed: parseInt(opts.seed, 10),
        workers: Math.max(1, Math.min(workers, cpus().length)),
        mode: mode,
        out: resolve(opts.out),
        verbose: Boolean(opts.verbose),
        json: Boolean(opts.json)
    };
}
/**
 * Print CLI banner
 */
function printBanner() {
    logger.header('SLOT MATH ENGINE TEMPLATE v1.0.0 - Simulator');
    console.log();
}
/**
 * Run the CLI
 */
export async function runCLI() {
    const program = createCLI();
    try {
        await program.parseAsync(process.argv);
    }
    catch (error) {
        logger.error(`CLI Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
// Export for direct usage
export { VERSION };
//# sourceMappingURL=cli.js.map