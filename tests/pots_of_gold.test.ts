import { describe, it, expect } from 'vitest';
import {
  simulatePotsOfGold,
  expectedRtpX,
  type Pot,
  type PotsOfGoldConfig,
  type PotsOfGoldRng,
} from '../src/features/potsOfGold.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Deterministic LCG — keeps tests reproducible without pulling a real RNG. */
class LcgRng implements PotsOfGoldRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  randInt(n: number): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state % n;
  }
}

/** Forces every draw to land on the first weighted slot it can. */
class StaticRng implements PotsOfGoldRng {
  constructor(private readonly fixed: number) {}
  randInt(n: number): number {
    return Math.min(this.fixed, Math.max(0, n - 1));
  }
}

const samplePool: Pot[] = [
  { id: 'M2', kind: 'multiplier', valueX: 2, weight: 5 },
  { id: 'M5', kind: 'multiplier', valueX: 5, weight: 3 },
  { id: 'M10', kind: 'multiplier', valueX: 10, weight: 2 },
  { id: 'C2', kind: 'collect', valueX: 2, weight: 2 },
  { id: 'STOP', kind: 'stop', valueX: 0, weight: 1 },
  { id: 'GRAND', kind: 'jackpot', valueX: 1000, weight: 1, jackpotTier: 'Grand' },
];

// ─── construction guards ──────────────────────────────────────────────────────

describe('simulatePotsOfGold — validation', () => {
  it('rejects empty pool', () => {
    expect(() =>
      simulatePotsOfGold({ pool: [], maxPicks: 1 }, new LcgRng(1))
    ).toThrow(/non-empty/);
  });

  it('rejects maxPicks <= 0', () => {
    expect(() =>
      simulatePotsOfGold(
        { pool: samplePool, maxPicks: 0 },
        new LcgRng(1)
      )
    ).toThrow(/positive integer/);
  });

  it('rejects duplicate pot ids', () => {
    expect(() =>
      simulatePotsOfGold(
        {
          pool: [
            { id: 'A', kind: 'multiplier', valueX: 1 },
            { id: 'A', kind: 'multiplier', valueX: 2 },
          ],
          maxPicks: 1,
        },
        new LcgRng(1)
      )
    ).toThrow(/duplicate pot id/);
  });

  it('rejects negative valueX on multiplier pot', () => {
    expect(() =>
      simulatePotsOfGold(
        { pool: [{ id: 'A', kind: 'multiplier', valueX: -1 }], maxPicks: 1 },
        new LcgRng(1)
      )
    ).toThrow(/valueX must be ≥ 0/);
  });

  it('rejects collect pot with valueX <= 0', () => {
    expect(() =>
      simulatePotsOfGold(
        { pool: [{ id: 'A', kind: 'collect', valueX: 0 }], maxPicks: 1 },
        new LcgRng(1)
      )
    ).toThrow(/collect pot.*valueX > 0/);
  });

  it('rejects non-integer / negative weight', () => {
    expect(() =>
      simulatePotsOfGold(
        { pool: [{ id: 'A', kind: 'multiplier', valueX: 1, weight: -1 }], maxPicks: 1 },
        new LcgRng(1)
      )
    ).toThrow(/non-negative integer/);
  });

  it('rejects pool with total weight 0', () => {
    expect(() =>
      simulatePotsOfGold(
        { pool: [{ id: 'A', kind: 'multiplier', valueX: 1, weight: 0 }], maxPicks: 1 },
        new LcgRng(1)
      )
    ).toThrow(/total weight cannot be zero/);
  });
});

// ─── lifecycle / mechanics ────────────────────────────────────────────────────

describe('simulatePotsOfGold — mechanics', () => {
  it('runs maxPicks picks when no terminator is hit (without replacement)', () => {
    const pool: Pot[] = [
      { id: 'A', kind: 'multiplier', valueX: 1, weight: 1 },
      { id: 'B', kind: 'multiplier', valueX: 2, weight: 1 },
      { id: 'C', kind: 'multiplier', valueX: 3, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 3 },
      new StaticRng(0) // always pick first available
    );
    expect(out.endReason).toBe('max_picks');
    expect(out.picks.length).toBe(3);
    expect(out.totalWinX).toBe(1 + 2 + 3);
  });

  it('with replacement: pool stays the same size every pick', () => {
    const pool: Pot[] = [
      { id: 'A', kind: 'multiplier', valueX: 1, weight: 1 },
      { id: 'B', kind: 'multiplier', valueX: 2, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 5, withReplacement: true },
      new StaticRng(0)
    );
    expect(out.endReason).toBe('max_picks');
    expect(out.picks.length).toBe(5);
    // every pick was the first pot ('A'), 5 × 1 = 5
    expect(out.totalWinX).toBe(5);
  });

  it('without replacement: pool exhaustion ends the bonus', () => {
    const pool: Pot[] = [
      { id: 'A', kind: 'multiplier', valueX: 1, weight: 1 },
      { id: 'B', kind: 'multiplier', valueX: 2, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 5 }, // bigger than pool
      new StaticRng(0)
    );
    expect(out.endReason).toBe('pool_exhausted');
    expect(out.picks.length).toBe(2);
    expect(out.totalWinX).toBe(1 + 2);
  });

  it('stop pot terminates immediately', () => {
    const pool: Pot[] = [
      { id: 'STOP', kind: 'stop', valueX: 0, weight: 1 },
      { id: 'M5', kind: 'multiplier', valueX: 5, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 5 },
      new StaticRng(0) // always picks STOP first
    );
    expect(out.endReason).toBe('stop');
    expect(out.picks.length).toBe(1);
    expect(out.totalWinX).toBe(0);
  });

  it('jackpot pot pays and terminates', () => {
    const pool: Pot[] = [
      { id: 'GRAND', kind: 'jackpot', valueX: 1000, weight: 1, jackpotTier: 'Grand' },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 5, withReplacement: true },
      new StaticRng(0)
    );
    expect(out.endReason).toBe('jackpot');
    expect(out.jackpotTier).toBe('Grand');
    expect(out.totalWinX).toBe(1000);
  });

  it('collect pot multiplies subsequent picks (product mode)', () => {
    const pool: Pot[] = [
      { id: 'C2', kind: 'collect', valueX: 2, weight: 1 },
      { id: 'M5', kind: 'multiplier', valueX: 5, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 2 },
      new StaticRng(0) // pick C2 then M5
    );
    expect(out.endReason).toBe('max_picks');
    // First pick: C2 → multiplier becomes 2
    // Second pick: M5 × multiplier 2 = 10
    expect(out.totalWinX).toBe(10);
    expect(out.finalMultiplier).toBe(2);
  });

  it('collect chain in sum mode adds rather than multiplies', () => {
    const pool: Pot[] = [
      { id: 'C2', kind: 'collect', valueX: 2, weight: 1 },
      { id: 'M5', kind: 'multiplier', valueX: 5, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 2, collectChainMode: 'sum' },
      new StaticRng(0)
    );
    // C2 in sum mode: mult goes 1 → 1 + 2 = 3
    // M5 × 3 = 15
    expect(out.totalWinX).toBe(15);
    expect(out.finalMultiplier).toBe(3);
  });

  it('audit record captures every pick with cumulative win', () => {
    const pool: Pot[] = [
      { id: 'M5', kind: 'multiplier', valueX: 5, weight: 1 },
      { id: 'M10', kind: 'multiplier', valueX: 10, weight: 1 },
    ];
    const out = simulatePotsOfGold(
      { pool, maxPicks: 2 },
      new StaticRng(0)
    );
    expect(out.picks[0].cumulativeWinX).toBe(5);
    expect(out.picks[1].cumulativeWinX).toBe(15);
    expect(out.picks[0].pickIndex).toBe(0);
    expect(out.picks[1].pickIndex).toBe(1);
  });
});

// ─── determinism ──────────────────────────────────────────────────────────────

describe('simulatePotsOfGold — determinism', () => {
  it('same seed → identical outcome', () => {
    const cfg: PotsOfGoldConfig = { pool: samplePool, maxPicks: 8, withReplacement: true };
    const a = simulatePotsOfGold(cfg, new LcgRng(2026));
    const b = simulatePotsOfGold(cfg, new LcgRng(2026));
    expect(a.picks).toEqual(b.picks);
    expect(a.totalWinX).toBe(b.totalWinX);
  });

  it('different seeds → at least one pick differs across many trials', () => {
    const cfg: PotsOfGoldConfig = { pool: samplePool, maxPicks: 8, withReplacement: true };
    // Across 20 distinct seed pairs, at least one pair must produce
    // different pick sequences — otherwise the RNG is broken or the
    // pool is unwinnably degenerate. With a 6-pot pool × 8 picks the
    // probability of any single pair colliding is < 6^-8 ≈ 6e-7.
    let anyDiffer = false;
    for (let s = 1; s <= 20; s++) {
      const a = simulatePotsOfGold(cfg, new LcgRng(s));
      const b = simulatePotsOfGold(cfg, new LcgRng(s + 1_000_003));
      if (
        JSON.stringify(a.picks.map((p) => p.pickedPotId)) !==
        JSON.stringify(b.picks.map((p) => p.pickedPotId))
      ) {
        anyDiffer = true;
        break;
      }
    }
    expect(anyDiffer).toBe(true);
  });
});

// ─── expected RTP ─────────────────────────────────────────────────────────────

describe('expectedRtpX', () => {
  it('returns 0 for an all-stop pool', () => {
    const cfg: PotsOfGoldConfig = {
      pool: [{ id: 'S', kind: 'stop', valueX: 0, weight: 1 }],
      maxPicks: 10,
      withReplacement: true,
    };
    expect(expectedRtpX(cfg)).toBe(0);
  });

  it('returns null for non-replacement pool with > 1 pot (combinatorial)', () => {
    expect(
      expectedRtpX({ pool: samplePool, maxPicks: 3, withReplacement: false })
    ).toBeNull();
  });

  it('matches MC mean within 10% on a simple with-replacement pool', () => {
    const pool: Pot[] = [
      { id: 'M1', kind: 'multiplier', valueX: 1, weight: 1 },
      { id: 'M2', kind: 'multiplier', valueX: 2, weight: 1 },
    ];
    const cfg: PotsOfGoldConfig = { pool, maxPicks: 5, withReplacement: true };
    const closed = expectedRtpX(cfg)!;
    let mcSum = 0;
    const TRIALS = 20_000;
    for (let i = 0; i < TRIALS; i++) {
      mcSum += simulatePotsOfGold(cfg, new LcgRng(i + 1)).totalWinX;
    }
    const mcMean = mcSum / TRIALS;
    expect(Math.abs(closed - mcMean) / closed).toBeLessThan(0.10);
  });

  it('larger maxPicks ⇒ larger expected RTP for non-terminator-heavy pool', () => {
    const pool: Pot[] = [
      { id: 'M', kind: 'multiplier', valueX: 1, weight: 1 },
    ];
    const cfg5 = { pool, maxPicks: 5, withReplacement: true };
    const cfg10 = { pool, maxPicks: 10, withReplacement: true };
    expect(expectedRtpX(cfg10)!).toBeGreaterThan(expectedRtpX(cfg5)!);
  });
});
