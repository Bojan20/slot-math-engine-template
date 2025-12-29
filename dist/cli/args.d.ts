/**
 * SLOT MATH ENGINE TEMPLATE - CLI Arguments Parser
 *
 * Production-grade command line interface for slot simulation.
 */
export interface CLIArgs {
    spins: number;
    bet: number;
    seed: number;
    workers: number;
    mode: 'base' | 'fs' | 'full';
    out: string;
    reels?: string;
    config?: string;
    quick: boolean;
    verbose: boolean;
}
export declare function parseArgs(argv?: string[]): CLIArgs;
export declare function formatArgs(args: CLIArgs): string;
//# sourceMappingURL=args.d.ts.map