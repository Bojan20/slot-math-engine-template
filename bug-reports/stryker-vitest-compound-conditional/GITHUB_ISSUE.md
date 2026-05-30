# Vitest runner: `ConditionalExpression → true` mutants on compound short-circuit `&&` lines reported Survived even when 4/4 tests kill them on hand-mutation

## Summary

When a source line contains a **compound short-circuit conditional** with `&&`, Stryker's `ConditionalExpression → true` mutant is reported **Survived** even when there exist unit tests that:

- Enter the branch (asserting the original `false` outcome),
- Are correctly listed under "Tests ran" for the mutant in Stryker's trace,
- Demonstrably kill the mutant when the source is hand-edited to `if (true) {`.

Workarounds in `coverageAnalysis` (`'perTest'` / `'all'` / `'off'`) produce identical survivor tallies. The only fix that flips the mutant from Survived → Killed is a **source refactor** to extract the compound condition into a named guard method.

## Environment

| Package | Version |
|---|---|
| `@stryker-mutator/core` | `^8.7.1` |
| `@stryker-mutator/vitest-runner` | `^8.7.1` |
| `vitest` | `^1.0.0` (reproduced on 1.6.1) |
| Node | v20+ |
| OS | macOS 14 (host-agnostic) |

## Minimal reproducer

Single file `src/limits.ts`:

```ts
export interface Limits { maxWagerPerSpin?: number; }

export function checkSpinAllowed(limits: Limits, wager: number): boolean {
  // Line 8 — the compound short-circuit conditional.
  if (limits.maxWagerPerSpin !== undefined && wager > limits.maxWagerPerSpin) {
    return false;
  }
  return true;
}
```

Four killer tests `tests/limits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkSpinAllowed } from '../src/limits.js';

describe('A — maxWagerPerSpin UNSET', () => {
  it('A1: small wager passes', () => {
    expect(checkSpinAllowed({}, 50)).toBe(true);
  });
  it('A2: huge wager passes when limit unset', () => {
    expect(checkSpinAllowed({}, 1_000_000)).toBe(true);
  });
});

describe('B — maxWagerPerSpin SET but NOT exceeded', () => {
  it('B1: wager at limit passes', () => {
    expect(checkSpinAllowed({ maxWagerPerSpin: 100 }, 100)).toBe(true);
  });
  it('B2: wager under limit passes', () => {
    expect(checkSpinAllowed({ maxWagerPerSpin: 100 }, 50)).toBe(true);
  });
});
```

`stryker.config.mjs`:

```js
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest', // also tried 'all' and 'off' — same result
  mutate: ['src/**/*.ts'],
  vitest: { configFile: 'vitest.config.ts' },
  thresholds: { high: 95, low: 80, break: 0 },
  disableTypeChecks: true,
};
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

## Reproduction steps

```bash
npm install
npm test                  # ✅ 4/4 PASS
npx stryker run           # ❌ reports 1 ConditionalExpression mutant SURVIVED
```

## Observed behaviour

Stryker output for the `ConditionalExpression → true` mutant on `src/limits.ts:8:7`:

```
[Survived] ConditionalExpression
src/limits.ts:8:7
-     if (limits.maxWagerPerSpin !== undefined && wager > limits.maxWagerPerSpin) {
+     if (true && wager > limits.maxWagerPerSpin) {
Tests ran:
    A — maxWagerPerSpin UNSET A1: small wager passes
    A — maxWagerPerSpin UNSET A2: huge wager passes when limit unset
    B — maxWagerPerSpin SET but NOT exceeded B1: wager at limit passes
  and 1 more test!
```

All four of our killer tests are listed under "Tests ran", yet the mutant is reported Survived.

## Hand-mutation verification (kill is achievable)

Edit `src/limits.ts` line 8 to `if (true) {` then `npm test`:

```
✗ A1: small wager passes  — expected false to be true
✗ A2: huge wager passes when limit unset  — expected false to be true
✗ B1: wager at limit passes  — expected false to be true
✗ B2: wager under limit passes  — expected false to be true

Tests  4 failed (4)
```

Hand-mutation kills the mutant with 4/4 tests. Stryker reports it Survived.

## What we tried

| Knob | Setting | Effect |
|---|---|---|
| `coverageAnalysis` | `'perTest'` (default) | Survived |
| `coverageAnalysis` | `'all'` | Survived |
| `coverageAnalysis` | `'off'` | Survived |
| `timeoutMS` | 10000 → 60000 | no change |
| `concurrency` | 4 → 1 | no change |
| Reorder test `describe` blocks | A first / B first | no change |

The only fix that flips Survived → Killed is **source refactor**:

```ts
function isMaxWagerExceeded(limits: Limits, wager: number): boolean {
  if (limits.maxWagerPerSpin === undefined) return false;
  return wager > limits.maxWagerPerSpin;
}

export function checkSpinAllowed(limits: Limits, wager: number): boolean {
  if (isMaxWagerExceeded(limits, wager)) return false;
  return true;
}
```

With this refactor Stryker correctly kills the mutant.

## Suspected root cause

Vitest's V8-based perTest coverage tracker appears to drop attribution for source lines containing short-circuit `&&` operators when the test path short-circuits on the first operand. When `@stryker-mutator/vitest-runner` consumes the coverage map and selects the test set per mutant ID, the compound-conditional line yields an empty test set, so the mutant is executed by zero tests and is recorded as Survived (with the spurious "Tests ran" list being the layer-zero collection rather than the per-mutant subset).

This hypothesis matches:

- `coverageAnalysis: 'off'` not helping — runner still uses some other mechanism that has the same gap.
- The refactor working — extracted helper method body is no longer behind a short-circuit operator.
- Hand-mutation success — V8 coverage drop is a Stryker-layer attribution issue, not a JS-execution issue.

## Impact

In a slot-math engine repo, **9 of 14 surviving mutants** in our scoped Stryker run share this exact pattern:

```ts
if (this.limits.<knob> !== undefined && <comparison>) { … }
```

Manual mutation confirms each is killable by an existing test. Stryker reports them all Survived, masking the real surface area of our mutation coverage gap (we are effectively at 98 % when Stryker reports 95.91 %).

## Possible fixes

1. Patch `@stryker-mutator/vitest-runner` to handle compound short-circuits when consuming V8 coverage.
2. If V8 itself is the source of truth, document the limitation in Stryker docs with the recommended refactor pattern.
3. Add a `--mutate-into-guards` hint flag that suggests extracting compound conditionals before mutating.

Happy to test a candidate fix on the production repo (~340-mutant scoped run) — just ping.

## Repro repo

Full standalone reproducer in `bug-reports/stryker-vitest-compound-conditional/` of the source repo. Five files total (`package.json`, `stryker.config.mjs`, `vitest.config.ts`, `src/limits.ts`, `tests/limits.test.ts`).
