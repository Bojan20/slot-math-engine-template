import { describe, it, expect } from 'vitest';
import {
  sideBetRtp,
  sideBetHitRate,
  sideBetVariance,
  resolveSideBet,
  assertOrthogonal,
  type SideBetConfig,
  type SideBetRng,
} from '../src/features/sideBet.js';
import { WashingtonSession } from '../src/evaluators/washingtonTicketPoolDraw.js';
import type { BingoRng } from '../src/evaluators/classIIBingoCoordinator.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

class StaticRng implements SideBetRng, BingoRng {
  private rolls: number[];
  private idx = 0;
  constructor(rolls: number[]) {
    this.rolls = rolls;
  }
  random(): number {
    const v = this.rolls[this.idx % this.rolls.length];
    this.idx += 1;
    return v;
  }
  randInt(n: number): number {
    const v = Math.floor(this.random() * n);
    return v % n;
  }
}

// ─── side bet validation ─────────────────────────────────────────────────────

describe('SideBetConfig — validation', () => {
  it('rejects empty id', () => {
    expect(() =>
      sideBetRtp({ id: '', outcomes: [{ id: 'a', probability: 1, payoutX: 1 }] })
    ).toThrow(/id required/);
  });

  it('rejects empty outcomes', () => {
    expect(() => sideBetRtp({ id: 'x', outcomes: [] })).toThrow(/at least one outcome/);
  });

  it('rejects duplicate outcome id', () => {
    expect(() =>
      sideBetRtp({
        id: 'x',
        outcomes: [
          { id: 'a', probability: 0.5, payoutX: 1 },
          { id: 'a', probability: 0.4, payoutX: 2 },
        ],
      })
    ).toThrow(/duplicate outcome id/);
  });

  it('rejects reserved id "__lose__"', () => {
    expect(() =>
      sideBetRtp({
        id: 'x',
        outcomes: [{ id: '__lose__', probability: 0.5, payoutX: 1 }],
      })
    ).toThrow(/reserved/);
  });

  it('rejects probability sum > 1', () => {
    expect(() =>
      sideBetRtp({
        id: 'x',
        outcomes: [
          { id: 'a', probability: 0.6, payoutX: 1 },
          { id: 'b', probability: 0.6, payoutX: 1 },
        ],
      })
    ).toThrow(/sum to.*> 1/);
  });

  it('rejects negative payoutX', () => {
    expect(() =>
      sideBetRtp({ id: 'x', outcomes: [{ id: 'a', probability: 0.5, payoutX: -1 }] })
    ).toThrow(/payoutX must be ≥ 0/);
  });

  it('rejects probability out of [0,1]', () => {
    expect(() =>
      sideBetRtp({
        id: 'x',
        outcomes: [{ id: 'a', probability: 1.5, payoutX: 1 }],
      })
    ).toThrow(/probability must be in/);
  });
});

// ─── side bet analytical ─────────────────────────────────────────────────────

describe('side bet analytical', () => {
  const cfg: SideBetConfig = {
    id: 'lightning',
    outcomes: [
      { id: 'jackpot', probability: 0.0001, payoutX: 1000 },
      { id: 'big', probability: 0.01, payoutX: 50 },
      { id: 'small', probability: 0.1, payoutX: 2 },
      // residual 0.8899 = implicit lose.
    ],
  };

  it('rtp = Σ p × payout', () => {
    expect(sideBetRtp(cfg)).toBeCloseTo(0.0001 * 1000 + 0.01 * 50 + 0.1 * 2, 9);
  });

  it('hit rate = Σ p for payoutX > 0', () => {
    expect(sideBetHitRate(cfg)).toBeCloseTo(0.0001 + 0.01 + 0.1, 9);
  });

  it('variance ≥ 0 for any well-formed config', () => {
    expect(sideBetVariance(cfg)).toBeGreaterThan(0);
  });

  it('all-lose outcome → rtp 0', () => {
    expect(
      sideBetRtp({
        id: 'losing',
        outcomes: [{ id: 'lose', probability: 0.5, payoutX: 0 }],
      })
    ).toBe(0);
  });

  it('assertOrthogonal returns true for valid config', () => {
    expect(assertOrthogonal(cfg)).toBe(true);
  });
});

// ─── side bet resolution ─────────────────────────────────────────────────────

describe('resolveSideBet', () => {
  const cfg: SideBetConfig = {
    id: 'x',
    outcomes: [
      { id: 'a', probability: 0.25, payoutX: 10 },
      { id: 'b', probability: 0.25, payoutX: 5 },
      // residual 0.5 = implicit lose.
    ],
  };

  it('roll 0.10 → outcome a (10x payout)', () => {
    const r = resolveSideBet({
      cfg,
      sideBetStakeMinor: 100,
      rng: new StaticRng([0.10]),
    });
    expect(r.outcomeId).toBe('a');
    expect(r.payoutX).toBe(10);
    expect(r.creditMinor).toBe(1000);
  });

  it('roll 0.40 → outcome b (5x payout)', () => {
    const r = resolveSideBet({
      cfg,
      sideBetStakeMinor: 100,
      rng: new StaticRng([0.40]),
    });
    expect(r.outcomeId).toBe('b');
    expect(r.payoutX).toBe(5);
    expect(r.creditMinor).toBe(500);
  });

  it('roll 0.80 → implicit lose (no payout)', () => {
    const r = resolveSideBet({
      cfg,
      sideBetStakeMinor: 100,
      rng: new StaticRng([0.80]),
    });
    expect(r.outcomeId).toBe('__lose__');
    expect(r.payoutX).toBe(0);
    expect(r.creditMinor).toBe(0);
  });

  it('rejects negative side bet stake', () => {
    expect(() =>
      resolveSideBet({ cfg, sideBetStakeMinor: -1, rng: new StaticRng([0.1]) })
    ).toThrow(/sideBetStakeMinor/);
  });

  it('zero stake yields zero credit even on a winning roll', () => {
    const r = resolveSideBet({
      cfg,
      sideBetStakeMinor: 0,
      rng: new StaticRng([0.1]),
    });
    expect(r.outcomeId).toBe('a');
    expect(r.creditMinor).toBe(0);
  });
});

// ─── Washington session ──────────────────────────────────────────────────────

describe('WashingtonSession', () => {
  const slice = [
    { id: 0, prizeX: 0 },
    { id: 1, prizeX: 5 },
    { id: 2, prizeX: 100 },
    { id: 3, prizeX: 1000 },
  ];

  it('rejects construction with empty slice', () => {
    expect(
      () =>
        new WashingtonSession(
          { sessionId: 's1', sliceTickets: [], stateTaxRate: 0.1 },
          { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
        )
    ).toThrow(/empty session slice/);
  });

  it('rejects negative or > 1 state tax rate', () => {
    expect(
      () =>
        new WashingtonSession(
          { sessionId: 's', sliceTickets: slice, stateTaxRate: -0.01 },
          { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
        )
    ).toThrow(/stateTaxRate/);
    expect(
      () =>
        new WashingtonSession(
          { sessionId: 's', sliceTickets: slice, stateTaxRate: 1.5 },
          { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
        )
    ).toThrow(/stateTaxRate/);
  });

  it('applies state tax to gross prize', () => {
    const sess = new WashingtonSession(
      { sessionId: 's', sliceTickets: [{ id: 0, prizeX: 100 }, { id: 1, prizeX: 0 }], stateTaxRate: 0.10 },
      { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
    );
    const r = sess.draw();
    expect(r.grossPrizeX).toBe(100);
    expect(r.taxWithheldX).toBe(10);
    expect(r.netPrizeX).toBe(90);
  });

  it('surfaces a near-miss pot id (≠ actual ticket id)', () => {
    const sess = new WashingtonSession(
      { sessionId: 's', sliceTickets: slice, stateTaxRate: 0 },
      { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
    );
    const r = sess.draw();
    expect(r.nearMissPotId).toBeDefined();
    expect(r.nearMissPotId).not.toBe(r.ticket.id);
  });

  it('refuses further draws after slice exhaustion', () => {
    const sess = new WashingtonSession(
      { sessionId: 's', sliceTickets: [{ id: 0, prizeX: 10 }], stateTaxRate: 0 },
      { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
    );
    sess.draw();
    expect(sess.isActive()).toBe(false);
    expect(() => sess.draw()).toThrow(/session is closed/);
  });

  it('remaining() tracks slice size', () => {
    const sess = new WashingtonSession(
      { sessionId: 's', sliceTickets: slice, stateTaxRate: 0 },
      { coordinatorPoolId: 'wa', rng: new StaticRng([0]) }
    );
    expect(sess.remaining()).toBe(4);
    sess.draw();
    expect(sess.remaining()).toBe(3);
  });
});
