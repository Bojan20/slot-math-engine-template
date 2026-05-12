// Stryker mutation testing configuration
// Run: npx stryker run
// Target: mutation score ≥ 95% per FAZA 10.7 acceptance criteria
/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  testRunner: 'vitest',
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  coverageAnalysis: 'perTest',

  // Focus on core math modules — highest mutation sensitivity
  mutate: [
    'src/engine/evaluate.ts',
    'src/engine/irEvaluator.ts',
    'src/engine/features.ts',
    'src/observability/session.ts',
    'src/jackpot/manager.ts',
    'src/rg/session.ts',
    'src/sensitivity/analyzer.ts',
    'src/crypto/chacha20.ts',
    'src/fraud/detector.ts',
    'src/player/simulator.ts',
    // Exclude test files, type files, index re-exports
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/types.ts',
  ],

  thresholds: {
    high: 95,
    low: 90,
    break: 80,       // CI fails if mutation score drops below 80%
  },

  vitest: {
    configFile: 'vitest.config.ts',
  },

  // Limit concurrency to avoid OOM on large codebases
  concurrency: 4,
  timeoutMS: 30000,
  timeoutFactor: 2.5,

  // HTML report output
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },

  // JSON report for CI parsing
  jsonReporter: {
    fileName: 'reports/mutation/mutation-report.json',
  },

  // Ignore surviving mutants in generated/scaffold code
  ignorers: [],

  disableTypeChecks: true,
};
