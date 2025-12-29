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
declare const VERSION = "1.0.0";
export interface SimOptions {
    spins: number;
    bet: number;
    seed: number;
    workers: number;
    mode: 'base' | 'fs' | 'full';
    out: string;
    verbose: boolean;
    json: boolean;
}
export interface CompareOptions {
    report1: string;
    report2: string;
    out: string;
}
export interface LockOptions {
    report: string;
    force: boolean;
}
export interface ExportOptions {
    report: string;
    format: 'csv' | 'json';
    out: string;
}
/**
 * Create the CLI program
 */
export declare function createCLI(): Command;
/**
 * Run the CLI
 */
export declare function runCLI(): Promise<void>;
export { VERSION };
//# sourceMappingURL=cli.d.ts.map