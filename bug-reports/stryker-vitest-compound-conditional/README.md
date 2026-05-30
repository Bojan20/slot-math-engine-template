# Bug report: Stryker + Vitest perTest coverage drops compound short-circuit conditionals

**Repo / package versions (reproduced 2026-05-30):**

| Package | Version |
|---|---|
| `@stryker-mutator/core` | `^8.7.1` |
| `@stryker-mutator/vitest-runner` | `^8.7.1` |
| `vitest` | `^1.0.0` |
| Node | v20+ |
| OS | macOS 14 / Linux (host-agnostic) |

## TL;DR

When a source line is a **compound short-circuit conditional**, e.g.

```ts
if (this.limits.maxWagerPerSpin !== undefined && wager > this.limits.maxWagerPerSpin) { … }
```

Stryker `ConditionalExpression → true` mutant is reported **Survived** even
when a unit test that enters the branch (limit SET, wager UNDER) ASSERTS the
opposite payload from what the mutant produces.

- **Manual mutation reproduces the kill:** hand-editing source to `if (true)`
  → existing tests fail with the expected refusal payload.
- **Stryker reports survived under all three coverage modes:**
  `coverageAnalysis: 'perTest'`, `'all'`, AND `'off'` — identical
  `326 killed / 14 survived` tally.
- **Root cause hypothesis:** V8 perTest coverage tracker doesn't attribute the
  whole compound `if` line to a test when the test short-circuits on the
  first operand (`X !== undefined`). When Stryker checks `mutantsCoveredBy[L]`
  for that line, the qualifying test set is empty → mutant gets no test runner
  → reported Survived.

## Why it matters

In a slot-math engine codebase, a common pattern is:

```ts
if (this.limits.maxWagerPerSpin !== undefined && wager > this.limits.maxWagerPerSpin) {
  return refusal('max_wager_exceeded');
}
```

Every test that exercises the `maxWagerPerSpin` guard hits this branch. They
all kill the mutant on hand-mutation, but Stryker reports it survived,
inflating the survivor count by ~9 mutants in our scoped run.

## Minimal reproducer

See `src/`, `tests/`, `package.json`, `stryker.config.mjs`,
`vitest.config.ts` siblings in this directory. To reproduce:

```bash
cd bug-reports/stryker-vitest-compound-conditional
npm install
npm test                  # all 4 tests pass
npx stryker run           # reports 1 SURVIVED out of 4 mutants
# Now hand-mutate src/limits.ts L8 to: if (true) {
npm test                  # 2 tests FAIL — proving the mutant IS killable
```

## Expected vs observed

| Run | Expected | Observed |
|---|---|---|
| `npm test` (clean) | 4 pass | ✅ 4 pass |
| `npm test` (`if (true)` mutation) | 2 fail (mutant killed) | ✅ 2 fail |
| `npx stryker run` | 0 survived (mutant killed by 2 tests) | ❌ 1 survived |

## Workarounds we tried

| Approach | Result |
|---|---|
| `coverageAnalysis: 'perTest'` | survives |
| `coverageAnalysis: 'all'` | survives |
| `coverageAnalysis: 'off'` | survives |
| Increase `timeoutMS` / `timeoutFactor` | no effect |
| Reduce `concurrency` to 1 | no effect |
| Add `ignorePatterns` exclusions | no effect |

The only fix that works is **source refactor**: extract the compound
condition into a named guard method so the mutator targets the method body,
not the inline `&&` expression.

## Source refactor that does kill the mutant

```ts
// Before — Stryker says SURVIVED
function check(limits, wager) {
  if (limits.maxWagerPerSpin !== undefined && wager > limits.maxWagerPerSpin) {
    return false;
  }
  return true;
}

// After — Stryker says KILLED
function isMaxWagerExceeded(limits, wager) {
  if (limits.maxWagerPerSpin === undefined) return false;
  return wager > limits.maxWagerPerSpin;
}
function check(limits, wager) {
  if (isMaxWagerExceeded(limits, wager)) return false;
  return true;
}
```

## Suspected fix area

`@stryker-mutator/vitest-runner` — how it consumes V8 coverage from
Vitest's reporter, specifically the mapping from line-coverage data
back to mutant IDs when the line contains a short-circuit operator.
