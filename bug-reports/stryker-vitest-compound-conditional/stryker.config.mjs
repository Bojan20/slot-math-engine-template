/**
 * Minimal Stryker config that reproduces the bug:
 *   • One source file mutated.
 *   • Compound short-circuit `if` on line 8.
 *   • Two killer tests that hand-mutation proves DO kill the mutant.
 *   • Stryker reports the same mutant as Survived under all coverage modes.
 *
 * Run with:   npx stryker run
 */
export default {
  packageManager: 'npm',
  reporters: ['clear-text', 'progress'],
  testRunner: 'vitest',
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  coverageAnalysis: 'perTest',     // Try 'all' or 'off' — same survived tally.
  mutate: ['src/**/*.ts'],
  thresholds: { high: 95, low: 80, break: 0 },
  vitest: { configFile: 'vitest.config.ts' },
  concurrency: 2,
  timeoutMS: 30_000,
  timeoutFactor: 2.5,
  disableTypeChecks: true,
};
