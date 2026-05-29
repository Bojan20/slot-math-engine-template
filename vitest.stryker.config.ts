/**
 * Vitest config used ONLY by `stryker.scoped.config.mjs`.
 *
 * Drops the global `tests/**` glob in favor of a precise allowlist of
 * test files that exercise `src/rg/session.ts` and
 * `src/sensitivity/analyzer.ts`. With ~73 W239 specs + the older killer
 * waves we land at ~250 tests instead of ~7,300 — Stryker's perTest
 * coverage analysis becomes accurate (the noise floor of unrelated
 * tests was confusing the per-mutant test selection in earlier passes).
 *
 * If you add more `src/rg/session*` or `src/sensitivity/*` files,
 * extend the `include` list below.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      // W244 — Stryker 95 % push, targets remaining 30 survived mutants
      'tests/w244_stryker_95_killers.test.ts',
      // W239 final-pass killers
      'tests/w239_session_extra_killers.test.ts',
      'tests/w239_analyzer_extra_killers.test.ts',
      'tests/w239_final_killers.test.ts',
      // Prior killer/strengthening waves
      'tests/faza1310_rg_session_mutation_killers.test.ts',
      'tests/faza118_rg_aml.test.ts',
      'tests/faza118_rg_strength.test.ts',
      'tests/faza67_sensitivity.test.ts',
      'tests/faza67_sensitivity_mutation_strengthening.test.ts',
      'tests/faza67_sensitivity_strength.test.ts',
    ],
    exclude: ['**/._*', '**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
  },
});
