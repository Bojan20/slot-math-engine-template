/**
 * Hand-mutation verification:
 *
 *   1. `npm test` → all 4 PASS.
 *   2. Hand-edit src/limits.ts L8 to:  `if (true) {`
 *   3. `npm test` → tests A2 and B2 FAIL with the refusal payload.
 *
 * This PROVES the `ConditionalExpression → true` mutant is killable.
 * But `npx stryker run` reports it Survived under every coverage mode.
 */
import { describe, it, expect } from 'vitest';
import { checkSpinAllowed } from '../src/limits.js';

describe('A — maxWagerPerSpin UNSET (limits = {})', () => {
  it('A1: small wager passes (control)', () => {
    expect(checkSpinAllowed({}, 50)).toBe(true);
  });
  it('A2: huge wager passes when limit unset (kills `if (true)` mutant via first operand `undefined !== undefined === false`)', () => {
    // Mutant `if (true)` returns false; original returns true.
    expect(checkSpinAllowed({}, 1_000_000)).toBe(true);
  });
});

describe('B — maxWagerPerSpin SET but NOT exceeded', () => {
  it('B1: wager exactly at limit passes (boundary)', () => {
    expect(checkSpinAllowed({ maxWagerPerSpin: 100 }, 100)).toBe(true);
  });
  it('B2: wager under limit passes (kills `if (true)` mutant via second operand 50>100===false)', () => {
    // This is the test Stryker fails to attribute. Hand-mutation proves it
    // DOES catch `if (true)` (mutant returns false; original true).
    expect(checkSpinAllowed({ maxWagerPerSpin: 100 }, 50)).toBe(true);
  });
});
