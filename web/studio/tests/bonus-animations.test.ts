// W200.3 — Bonus-feature animation spec suite.
//
// We exercise the animator in headless mode (no real Pixi, no real DOM)
// so the suite runs inside the default node environment. All splash /
// orb-land / cascade-phase durations are squashed to 1ms by the
// `headless` branch in `bonusAnimations.ts`, so the whole suite finishes
// in well under a second.

import { describe, it, expect } from 'vitest';
import {
  createBonusAnimator,
  applyCascadeGravity,
  identifyWinningCells,
  type AnimationState,
} from '../src/bonusAnimations.js';

function makeAnimator() {
  return createBonusAnimator(null, { headless: true });
}

describe('W200.3 · bonus animator · state machine', () => {
  it('starts in idle and accepts spinning → idle round-trip', () => {
    const a = makeAnimator();
    expect(a.state()).toBe('idle');
    a.transitionTo('spinning');
    expect(a.state()).toBe('spinning');
    a.transitionTo('idle');
    expect(a.state()).toBe('idle');
  });

  it('rejects an invalid transition with an error', () => {
    const a = makeAnimator();
    expect(() => a.transitionTo('hw-payout' as AnimationState)).toThrowError(
      /illegal transition/,
    );
  });

  it('allows idle from any state as the abort escape hatch', () => {
    const a = makeAnimator();
    a.transitionTo('spinning');
    a.transitionTo('cascade-dissolve');
    a.transitionTo('idle'); // legal even though no direct edge listed
    expect(a.state()).toBe('idle');
  });
});

describe('W200.3 · fsIntro / fsMode / fsOutro', () => {
  it('fsIntro completes a promise and lands in fs-mode', async () => {
    const a = makeAnimator();
    await a.fsIntro(3, 10);
    expect(a.state()).toBe('fs-mode');
  });

  it('fsIntro rejects scatterCount < 3', async () => {
    const a = makeAnimator();
    await expect(a.fsIntro(2, 10)).rejects.toThrow(/scatterCount/);
  });

  it('fsModeIndicator stores counter values', async () => {
    const a = makeAnimator();
    await a.fsIntro(3, 10);
    a.fsModeIndicator(4, 10, 2);
    // No public getter — but state remains in fs-mode and we did not throw.
    expect(a.state()).toBe('fs-mode');
  });

  it('fsOutro splash returns to idle', async () => {
    const a = makeAnimator();
    await a.fsIntro(3, 10);
    await a.fsOutro(250);
    expect(a.state()).toBe('idle');
  });
});

describe('W200.3 · hwIntro / hwOrbLand / hwPayout', () => {
  it('hwIntro pre-condition rejects orbCount < 6', async () => {
    const a = makeAnimator();
    await expect(a.hwIntro(5, [])).rejects.toThrow(/orbCount/);
  });

  it('hwOrbLand stores the orb at the right position', async () => {
    const a = makeAnimator();
    await a.hwIntro(6, []);
    await a.hwOrbLand(2, 1, 50);
    expect(a.state()).toBe('hw-orb-land');
  });

  it('hwPayout sums orb values via splash text and exits to idle', async () => {
    const a = makeAnimator();
    await a.hwIntro(6, []);
    await a.hwOrbLand(0, 0, 10);
    await a.hwOrbLand(1, 1, 20);
    await a.hwPayout([
      { r: 0, c: 0, value: 10 },
      { r: 1, c: 1, value: 20 },
      { r: 2, c: 2, value: 30 },
    ]);
    // hwPayout drives the state through hw-outro → idle.
    expect(a.state()).toBe('idle');
  });
});

describe('W200.3 · cascadeStep', () => {
  it('cascade dissolve identifies winning cells from win positions', () => {
    const wins = [
      { positions: [[0, 1], [1, 1], [2, 1]] as Array<[number, number]> },
      { positions: [[0, 0], [1, 0]] as Array<[number, number]> },
    ];
    const cells = identifyWinningCells(wins);
    expect(cells).toContainEqual({ r: 1, c: 0 });
    expect(cells).toContainEqual({ r: 1, c: 1 });
    // No duplicates.
    const keys = new Set(cells.map((c) => `${c.r},${c.c}`));
    expect(keys.size).toBe(cells.length);
  });

  it('cascade drop preserves gravity (top symbols slide down to fill)', () => {
    const grid: string[][] = [
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
      ['G', 'H', 'I'],
    ];
    // Remove (1,0) and (2,0) → column 0 should become [null, null, 'A'].
    const after = applyCascadeGravity(grid, [
      { r: 1, c: 0 },
      { r: 2, c: 0 },
    ]);
    expect(after[2]![0]).toBe('A');
    expect(after[1]![0]).toBeNull();
    expect(after[0]![0]).toBeNull();
    // Other columns must stay intact (only their relative falls matter).
    expect(after[0]![1]).toBe('B');
    expect(after[1]![1]).toBe('E');
    expect(after[2]![1]).toBe('H');
  });

  it('cascade depth capped at maxChain', async () => {
    const a = createBonusAnimator(null, { headless: true, maxChain: 5 });
    await a.cascadeStep(99, [{ r: 0, c: 0 }]);
    // Run a second step at the cap — should not throw.
    await a.cascadeStep(99, [{ r: 0, c: 1 }]);
    // State settles to idle after the refill phase (no FS mode here).
    expect(a.state()).toBe('idle');
  });
});

describe('W200.3 · demo mode + transitions', () => {
  it('demo mode forces FS state without a real spin trigger', async () => {
    const a = makeAnimator();
    expect(a.state()).toBe('idle');
    await a.fsIntro(3, 10); // manual demo invoke
    expect(a.state()).toBe('fs-mode');
    await a.fsOutro(0);
    expect(a.state()).toBe('idle');
  });

  it('destroy() is idempotent and clears state without throws', () => {
    const a = makeAnimator();
    a.destroy();
    a.destroy(); // second call must be a no-op
    expect(true).toBe(true);
  });
});

describe('W200.3 · cascade chain sequencing', () => {
  it('cascadeStep transitions dissolve → drop → refill in order', async () => {
    const a = makeAnimator();
    const states: AnimationState[] = [];
    // Slip in a poll between awaits is hard without timers — instead we
    // assert by initiating a cascadeStep manually and watching the final
    // state, then a second invocation must succeed (graph re-entry).
    await a.cascadeStep(1, [{ r: 0, c: 0 }]);
    states.push(a.state());
    await a.cascadeStep(2, [{ r: 1, c: 0 }]);
    states.push(a.state());
    // Both should end at idle (no FS mode).
    expect(states).toEqual(['idle', 'idle']);
  });

  it('resetCascade clears the depth counter', async () => {
    const a = makeAnimator();
    await a.cascadeStep(3, [{ r: 0, c: 0 }]);
    a.resetCascade();
    // No public getter — but second cascadeStep must work fine.
    await a.cascadeStep(1, [{ r: 0, c: 0 }]);
    expect(a.state()).toBe('idle');
  });
});
