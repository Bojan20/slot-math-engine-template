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
  // W244 wave 5 update (2026-05-30): score 95.91 → 98.02 % after
  // `src/rg/session.ts` guard-method refactor (commit dffc8ad8). The
  // compound short-circuit `if (X !== undefined && violation)` lines
  // were hoisted into named `_is*` methods with `?? Infinity` fallback,
  // removing both the Stryker+vitest perTest attribution bug surface
  // (see bug-reports/stryker-vitest-compound-conditional/) AND the
  // `if (cap === undefined) return false` death-equivalents that the
  // naive guard-extract pattern introduced. Remaining 7 surviving
  // mutants are genuine death-equivalents: 3 in rg/session.ts
  // (MIN_SPIN_MS constant-folded edges) and 4 in sensitivity/analyzer.ts
  // (float `<` vs `<=` boundaries on RNG output where exact equality is
  // statistically unreachable). Threshold high=95 cleared by 3 pp.
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
  ignorePatterns: [
    'reports/qa_agent',
    '.stryker-tmp',
    'node_modules',
    'target',
    'rust-sim/target',
    '.stryker-tmp/**',
  ],
};
