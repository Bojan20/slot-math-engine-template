import { describe, it, expect } from 'vitest';
import {
  requiredSpinsForPrecision,
  ciHalfWidth,
  evaluateConvergence,
  aggregateAcceptance,
  DEFAULT_RTP_PRECISION,
  DEFAULT_CONFIDENCE,
  Z_SCORES,
  type AcceptanceTarget,
  type MCSample,
  type AcceptanceFixtureResult,
} from '../src/sim/acceptanceHarness.js';

// ─── precision math ───────────────────────────────────────────────────────────

describe('requiredSpinsForPrecision', () => {
  it('default precision is ±0.001% (= 1e-5)', () => {
    expect(DEFAULT_RTP_PRECISION).toBe(0.00001);
  });

  it('default confidence is 99% (z=2.576)', () => {
    expect(DEFAULT_CONFIDENCE).toBe(0.99);
    expect(Z_SCORES['0.99']).toBe(2.5758);
  });

  it('returns 1 for σ=0 (degenerate, every spin pays the same)', () => {
    expect(requiredSpinsForPrecision({ perSpinVariance: 0 })).toBe(1);
  });

  it('matches (z×σ/p)² formula for σ=5 (typical slot)', () => {
    const N = requiredSpinsForPrecision({ perSpinVariance: 25 });
    // (2.5758 × 5 / 0.00001)² = 1.66e12 — Faza 9.8 territory
    expect(N).toBeGreaterThan(1.6e12);
    expect(N).toBeLessThan(1.7e12);
  });

  it('lower variance ⇒ fewer spins needed', () => {
    const lo = requiredSpinsForPrecision({ perSpinVariance: 1 });
    const hi = requiredSpinsForPrecision({ perSpinVariance: 100 });
    expect(hi).toBeGreaterThan(lo);
  });

  it('higher confidence ⇒ more spins needed', () => {
    const c95 = requiredSpinsForPrecision({ perSpinVariance: 1, confidence: 0.95 });
    const c99 = requiredSpinsForPrecision({ perSpinVariance: 1, confidence: 0.99 });
    expect(c99).toBeGreaterThan(c95);
  });

  it('looser precision ⇒ fewer spins needed', () => {
    const tight = requiredSpinsForPrecision({ perSpinVariance: 1, precision: 1e-5 });
    const loose = requiredSpinsForPrecision({ perSpinVariance: 1, precision: 5e-4 });
    expect(tight).toBeGreaterThan(loose);
  });

  it('precision=0 returns Infinity', () => {
    expect(requiredSpinsForPrecision({ perSpinVariance: 1, precision: 0 })).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it('snapshot: 10⁹ spins targets σ ≈ 1.23 at ±0.001%/99%', () => {
    // Inverse: σ = precision × √N / z = 1e-5 × √1e9 / 2.5758 ≈ 0.1228
    // So for σ ≤ 0.12 we converge at 10⁹.
    const N = requiredSpinsForPrecision({ perSpinVariance: 0.12 ** 2 });
    expect(N).toBeLessThanOrEqual(1e9);
  });
});

// ─── CI half-width ────────────────────────────────────────────────────────────

describe('ciHalfWidth', () => {
  it('returns Infinity for n=0', () => {
    expect(ciHalfWidth({ spins: 0, perSpinVariance: 1 })).toBe(Number.POSITIVE_INFINITY);
  });

  it('matches z×σ/√n formula', () => {
    const hw = ciHalfWidth({ spins: 10_000, perSpinVariance: 1 });
    const expected = 2.5758 / Math.sqrt(10_000);
    expect(hw).toBeCloseTo(expected, 12);
  });

  it('shrinks as √n grows (4× spins ⇒ 2× tighter CI)', () => {
    const hw1 = ciHalfWidth({ spins: 1_000, perSpinVariance: 1 });
    const hw4 = ciHalfWidth({ spins: 4_000, perSpinVariance: 1 });
    expect(hw1 / hw4).toBeCloseTo(2.0, 10);
  });
});

// ─── evaluateConvergence ──────────────────────────────────────────────────────

describe('evaluateConvergence', () => {
  const closedFormTarget: AcceptanceTarget = {
    referenceRtp: 0.96,
    mode: 'closed_form',
  };

  it('returns converged when CI half-width ≤ precision and delta within band', () => {
    // Pick a fixture with variance=0.01 (σ=0.1) and N=10⁹.
    // CI half-width = 2.5758 × 0.1 / √1e9 ≈ 8.15e-6 < 1e-5.
    const sample: MCSample = {
      spinsSoFar: 1_000_000_000,
      runningRtp: 0.96000005,
      runningVariance: 0.01,
    };
    const v = evaluateConvergence(sample, closedFormTarget);
    expect(v.status).toBe('converged');
    expect(v.ciHalfWidth).toBeLessThan(1e-5);
    expect(Math.abs(v.delta)).toBeLessThan(1e-5);
  });

  it('returns too_few_spins when n < required and not yet diverged', () => {
    const sample: MCSample = {
      spinsSoFar: 1000,
      runningRtp: 0.961,
      runningVariance: 25,
    };
    const v = evaluateConvergence(sample, closedFormTarget);
    expect(v.status).toBe('too_few_spins');
    expect(v.requiredSpins).toBeGreaterThan(1e10);
  });

  it('returns diverged_from_reference when |delta| > precision + CI', () => {
    // RTP wildly off, CI tight enough that we know it's not noise.
    const sample: MCSample = {
      spinsSoFar: 1_000_000_000,
      runningRtp: 0.97, // 1pp off target 0.96
      runningVariance: 0.01,
    };
    const v = evaluateConvergence(sample, closedFormTarget);
    expect(v.status).toBe('diverged_from_reference');
  });

  it('self_replay mode requires exact zero delta', () => {
    const target: AcceptanceTarget = { referenceRtp: 0.96, mode: 'self_replay' };
    expect(
      evaluateConvergence(
        { spinsSoFar: 100, runningRtp: 0.96, runningVariance: 0 },
        target
      ).status
    ).toBe('converged');
    expect(
      evaluateConvergence(
        { spinsSoFar: 100, runningRtp: 0.96 + 1e-9, runningVariance: 0 },
        target
      ).status
    ).toBe('diverged_from_reference');
  });

  it('reason field is descriptive on every outcome', () => {
    const verdicts = [
      evaluateConvergence(
        { spinsSoFar: 1, runningRtp: 0.96, runningVariance: 25 },
        closedFormTarget
      ),
      evaluateConvergence(
        { spinsSoFar: 1_000_000_000, runningRtp: 0.96, runningVariance: 0.01 },
        closedFormTarget
      ),
    ];
    for (const v of verdicts) {
      expect(v.reason.length).toBeGreaterThan(10);
    }
  });

  it('spinsMargin reports required/actual ratio', () => {
    const v = evaluateConvergence(
      { spinsSoFar: 1_000_000, runningRtp: 0.96, runningVariance: 1 },
      closedFormTarget
    );
    // required ≈ 6.6e10, actual 1e6 ⇒ margin ≈ 66 000
    expect(v.spinsMargin).toBeGreaterThan(1000);
  });

  it('reference_par mode uses operator-supplied target', () => {
    const target: AcceptanceTarget = {
      referenceRtp: 0.965, // published PAR claim
      mode: 'reference_par',
    };
    const sample: MCSample = {
      spinsSoFar: 1_000_000_000,
      runningRtp: 0.965,
      runningVariance: 0.01,
    };
    expect(evaluateConvergence(sample, target).status).toBe('converged');
  });

  it('custom precision overrides default', () => {
    // Looser ±0.05% target — converges at smaller N.
    // Required: (2.5758 × σ / 5e-4)² with σ=1 → ≈ 26.5M.  Use 50M to clear.
    const target: AcceptanceTarget = {
      referenceRtp: 0.96,
      precision: 5e-4,
      mode: 'closed_form',
    };
    const sample: MCSample = {
      spinsSoFar: 50_000_000,
      runningRtp: 0.96,
      runningVariance: 1,
    };
    expect(evaluateConvergence(sample, target).status).toBe('converged');
  });

  it('custom confidence affects CI scaling', () => {
    const target95: AcceptanceTarget = {
      referenceRtp: 0.96,
      confidence: 0.95,
      mode: 'closed_form',
    };
    const target99: AcceptanceTarget = {
      referenceRtp: 0.96,
      confidence: 0.99,
      mode: 'closed_form',
    };
    const sample: MCSample = {
      spinsSoFar: 1_000_000,
      runningRtp: 0.96,
      runningVariance: 1,
    };
    const v95 = evaluateConvergence(sample, target95);
    const v99 = evaluateConvergence(sample, target99);
    expect(v95.ciHalfWidth).toBeLessThan(v99.ciHalfWidth);
  });
});

// ─── aggregateAcceptance ──────────────────────────────────────────────────────

describe('aggregateAcceptance', () => {
  const mkSample = (rtp: number, variance: number, spins = 1_000_000_000): MCSample => ({
    spinsSoFar: spins,
    runningRtp: rtp,
    runningVariance: variance,
  });
  const tgt: AcceptanceTarget = { referenceRtp: 0.96, mode: 'closed_form' };

  it('reports converged when every fixture converges', () => {
    const fixtures: AcceptanceFixtureResult[] = [
      {
        fixtureId: 'a',
        verdict: evaluateConvergence(mkSample(0.96, 0.01), tgt),
      },
      {
        fixtureId: 'b',
        verdict: evaluateConvergence(mkSample(0.96, 0.005), tgt),
      },
    ];
    const summary = aggregateAcceptance(fixtures);
    expect(summary.overall).toBe('converged');
    expect(summary.convergedCount).toBe(2);
    expect(summary.totalCount).toBe(2);
  });

  it('reports diverged when ANY fixture diverges', () => {
    const fixtures: AcceptanceFixtureResult[] = [
      {
        fixtureId: 'good',
        verdict: evaluateConvergence(mkSample(0.96, 0.01), tgt),
      },
      {
        fixtureId: 'bad',
        verdict: evaluateConvergence(mkSample(0.97, 0.01), tgt),
      },
    ];
    const summary = aggregateAcceptance(fixtures);
    expect(summary.overall).toBe('diverged_from_reference');
  });

  it('reports too_few_spins when no diverge / no not-converged but some too-few', () => {
    const fixtures: AcceptanceFixtureResult[] = [
      {
        fixtureId: 'a',
        verdict: evaluateConvergence(mkSample(0.96, 25, 1000), tgt),
      },
    ];
    const summary = aggregateAcceptance(fixtures);
    expect(summary.overall).toBe('too_few_spins');
  });

  it('empty input returns too_few_spins with zero counts', () => {
    const summary = aggregateAcceptance([]);
    expect(summary.totalCount).toBe(0);
    expect(summary.overall).toBe('too_few_spins');
  });

  it('worstDelta and worstCiHalfWidth report max-abs metrics', () => {
    const fixtures: AcceptanceFixtureResult[] = [
      {
        fixtureId: 'a',
        verdict: evaluateConvergence(mkSample(0.96 + 1e-6, 0.01), tgt),
      },
      {
        fixtureId: 'b',
        verdict: evaluateConvergence(mkSample(0.96 + 5e-6, 0.01), tgt),
      },
    ];
    const summary = aggregateAcceptance(fixtures);
    expect(Math.abs(summary.worstDelta)).toBeGreaterThanOrEqual(5e-6);
  });
});

// ─── snapshot rows for reports/acceptance ──────────────────────────────────

describe('precision target snapshot', () => {
  it('±0.001% is what the regulator gate enforces', () => {
    expect(DEFAULT_RTP_PRECISION).toBe(1e-5);
  });

  it('99% confidence z = 2.5758 (NIST standard quantile)', () => {
    expect(Z_SCORES['0.99']).toBeCloseTo(2.5758, 4);
  });
});
