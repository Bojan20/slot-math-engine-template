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
  // W244 pass 3 investigation note (2026-05-30):
  // Score held at 95.91 % despite 9 new logically-killable killer tests in
  // `tests/w244_stryker_98_killers.test.ts`. Manual mutation reproduction
  // confirmed RG-01 (limits={}) AND W244-PASS3 RG-L74 (limits.maxWagerPerSpin=100,
  // wager=50) BOTH fail when L74 source is hand-mutated to `if (true)`.
  // Stryker scoped run with coverageAnalysis: 'perTest', 'all', AND 'off'
  // all returned identical 326 killed / 14 survived. Stryker + vitest
  // perTest coverage map appears to drop short-circuited compound
  // conditional evaluations from the test→mutant mapping. The 14 survivors
  // include 5 true death-equivalents (constant-folded MIN_SPIN_MS, off-by-one
  // neutralized by `if (!reelMap) continue`, two float boundaries on RNG output)
  // and 9 tooling-reported survivors that are killed by hand-mutation runs.
  // Keeping 'perTest' as fastest default; 'off' didn't change tally so no
  // value paying ~30× CPU per release. Pass-3 tests retained as semantic
  // regression guards.
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
