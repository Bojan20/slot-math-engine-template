/**
 * Scoped Stryker config — runs ONLY on the two files we're improving
 * in this push (P0 #8 TS push). Used by `npm run mutate:scoped`.
 * The default `npm run mutate` still scans the full file list in
 * `stryker.config.mjs`.
 */
export default {
  packageManager: 'npm',
  reporters: ['clear-text', 'progress', 'json'],
  testRunner: 'vitest',
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  coverageAnalysis: 'perTest',
  mutate: ['src/rg/session.ts', 'src/sensitivity/analyzer.ts'],
  thresholds: { high: 95, low: 80, break: 70 },
  vitest: { configFile: 'vitest.stryker.config.ts' },
  concurrency: 4,
  timeoutMS: 30_000,
  timeoutFactor: 2.5,
  jsonReporter: { fileName: 'reports/mutation/scoped-2026-05-24.json' },
  disableTypeChecks: true,
  // Exclude live QA-agent symlinks/run artefacts that break Stryker's sandbox copy
  ignorePatterns: ['reports/qa_agent', '.stryker-tmp', 'node_modules'],
};
