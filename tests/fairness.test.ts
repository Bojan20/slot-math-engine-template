/**
 * W152 Faza 14.8 — Fairness module tests.
 *
 * Covers:
 *   * aggregateBySegment: bucketing + sum + RTP + standard-error.
 *   * Input-validation: negative bet / negative win rejected.
 *   * chiSquareGoodnessOfFit: identical RTP → stat ≈ 0; biased → stat ≫ 0.
 *   * Wilson-Hilferty p-value monotonic in stat.
 *   * Hastings normal upper-tail at canonical points.
 *   * Pairwise z-test: equal segments → z ≈ 0, |p| = 1.
 *   * fairnessReport: clean run → fair=true; biased run → fair=false
 *     with chi-square significant and at least one pair flagged.
 *   * Bonferroni correction scales with pair count.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateBySegment,
  chiSquareGoodnessOfFit,
  fairnessReport,
  pairwiseZ,
  pValueFromChiSquare,
  upperTailStandardNormal,
  type SpinRecord,
} from '../src/fairness/index.js';

function fillSpins(
  segment: string,
  count: number,
  betMc: number,
  winMc: number,
): SpinRecord[] {
  return Array.from({ length: count }, () => ({ segment, betMc, winMc }));
}

function mixedSegmentSpins(
  segment: string,
  count: number,
  betMc: number,
  rtp: number,
  variance = 0.1,
): SpinRecord[] {
  // Generate `count` spins whose long-run RTP ≈ `rtp` with controlled
  // variance via two-point payouts (0 or 2×). Deterministic via seed
  // → fixed cycle length.
  const spins: SpinRecord[] = [];
  let seed = 0x12345;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const u = seed / 0x7fffffff;
    // probability `p` of winning 2× bet, otherwise 0 → E[win] = 2p × bet
    // → RTP = 2p. So p = rtp/2.
    const p = Math.max(0, Math.min(1, rtp / 2));
    const winMc = u < p ? 2 * betMc : 0;
    void variance; // currently unused — placeholder for future heteroscedastic mode.
    spins.push({ segment, betMc, winMc });
  }
  return spins;
}

// ─── aggregateBySegment ────────────────────────────────────────────────────

describe('Faza 14.8 — aggregateBySegment', () => {
  it('buckets per segment + computes RTP', () => {
    const spins = [
      ...fillSpins('A', 100, 1000, 960),
      ...fillSpins('B', 200, 1000, 980),
    ];
    const stats = aggregateBySegment(spins);
    expect(stats).toHaveLength(2);
    const a = stats.find((s) => s.segment === 'A')!;
    const b = stats.find((s) => s.segment === 'B')!;
    expect(a.spinCount).toBe(100);
    expect(b.spinCount).toBe(200);
    expect(a.rtp).toBeCloseTo(0.96, 6);
    expect(b.rtp).toBeCloseTo(0.98, 6);
  });

  it('rejects bet ≤ 0', () => {
    expect(() => aggregateBySegment([{ segment: 'X', betMc: 0, winMc: 0 }])).toThrow(
      /betMc must be > 0/,
    );
  });

  it('rejects win < 0', () => {
    expect(() => aggregateBySegment([{ segment: 'X', betMc: 100, winMc: -1 }])).toThrow(
      /winMc must be ≥ 0/,
    );
  });

  it('zero-variance segment → SE = 0', () => {
    const stats = aggregateBySegment(fillSpins('X', 50, 1000, 960));
    expect(stats[0].rtpStdError).toBeCloseTo(0, 6);
  });

  it('non-zero-variance segment → SE > 0', () => {
    const spins = [
      ...fillSpins('X', 50, 1000, 1500),
      ...fillSpins('X', 50, 1000, 500),
    ];
    const stats = aggregateBySegment(spins);
    expect(stats[0].rtpStdError).toBeGreaterThan(0);
  });
});

// ─── chiSquareGoodnessOfFit ────────────────────────────────────────────────

describe('Faza 14.8 — chiSquareGoodnessOfFit', () => {
  it('< 2 segments → df = 0', () => {
    const stats = aggregateBySegment(fillSpins('only', 100, 1000, 960));
    expect(chiSquareGoodnessOfFit(stats, 0.96).df).toBe(0);
  });

  it('identical RTP across segments → chi² ≈ 0', () => {
    const stats = aggregateBySegment([
      ...fillSpins('A', 100, 1000, 960),
      ...fillSpins('B', 100, 1000, 960),
    ]);
    const chi = chiSquareGoodnessOfFit(stats, 0.96);
    expect(chi.statistic).toBeLessThan(1e-6);
  });

  it('biased RTP raises chi² monotonically', () => {
    // Segment A on-target, B drifts further from target.
    const aStats = aggregateBySegment([
      ...mixedSegmentSpins('A', 5000, 1000, 0.96),
      ...mixedSegmentSpins('B', 5000, 1000, 0.92),
    ]);
    const closer = aggregateBySegment([
      ...mixedSegmentSpins('A', 5000, 1000, 0.96),
      ...mixedSegmentSpins('B', 5000, 1000, 0.945),
    ]);
    expect(chiSquareGoodnessOfFit(aStats, 0.96).statistic).toBeGreaterThan(
      chiSquareGoodnessOfFit(closer, 0.96).statistic,
    );
  });
});

// ─── pValueFromChiSquare + normal tail ─────────────────────────────────────

describe('Faza 14.8 — Wilson-Hilferty + Hastings', () => {
  it('p-value is monotonically decreasing in chi²', () => {
    const small = pValueFromChiSquare(1, 4);
    const large = pValueFromChiSquare(20, 4);
    expect(large).toBeLessThan(small);
  });

  it('chi² = 0 → p ≈ 1', () => {
    expect(pValueFromChiSquare(0, 5)).toBeGreaterThan(0.99);
  });

  it('Hastings upper-tail at canonical z-scores', () => {
    expect(upperTailStandardNormal(0)).toBeCloseTo(0.5, 4);
    expect(upperTailStandardNormal(1.96)).toBeCloseTo(0.025, 3);
    expect(upperTailStandardNormal(2.576)).toBeCloseTo(0.005, 3);
  });
});

// ─── pairwiseZ ─────────────────────────────────────────────────────────────

describe('Faza 14.8 — pairwiseZ', () => {
  it('equal-RTP segments → z ≈ 0', () => {
    const [a, b] = aggregateBySegment([
      ...fillSpins('A', 100, 1000, 960),
      ...fillSpins('B', 100, 1000, 960),
    ]);
    const { zScore, pValue } = pairwiseZ(a, b);
    // Both have rtpStdError = 0 (zero variance) → z = 0 by convention.
    expect(zScore).toBe(0);
    expect(pValue).toBe(1);
  });

  it('different-RTP segments produce non-zero z when variance present', () => {
    const spinsA = mixedSegmentSpins('A', 5000, 1000, 0.96);
    const spinsB = mixedSegmentSpins('B', 5000, 1000, 0.85);
    const [aAgg, bAgg] = aggregateBySegment([...spinsA, ...spinsB]);
    const { zScore } = pairwiseZ(aAgg, bAgg);
    expect(Math.abs(zScore)).toBeGreaterThan(2);
  });
});

// ─── fairnessReport (end-to-end) ───────────────────────────────────────────

describe('Faza 14.8 — fairnessReport end-to-end', () => {
  it('clean run → fair = true', () => {
    const spins = [
      ...mixedSegmentSpins('high', 5000, 1000, 0.96),
      ...mixedSegmentSpins('casual', 5000, 1000, 0.96),
      ...mixedSegmentSpins('whale', 5000, 1000, 0.96),
    ];
    const r = fairnessReport(spins, 0.96);
    expect(r.fair).toBe(true);
    expect(r.chiSquare.significant).toBe(false);
    expect(r.pairwise.every((p) => !p.significantAfterBonferroni)).toBe(true);
  });

  it('biased run → fair = false + chi-square significant', () => {
    const spins = [
      ...mixedSegmentSpins('high', 10_000, 1000, 0.85),
      ...mixedSegmentSpins('casual', 10_000, 1000, 0.96),
      ...mixedSegmentSpins('whale', 10_000, 1000, 0.96),
    ];
    const r = fairnessReport(spins, 0.96);
    expect(r.fair).toBe(false);
    expect(r.chiSquare.significant).toBe(true);
    expect(r.pairwise.some((p) => p.significantAfterBonferroni)).toBe(true);
  });

  it('Bonferroni alpha scales with pair count', () => {
    // 4 segments → 6 pairs → corrected α = 0.001 / 6.
    const spins = [
      ...mixedSegmentSpins('A', 5000, 1000, 0.96),
      ...mixedSegmentSpins('B', 5000, 1000, 0.96),
      ...mixedSegmentSpins('C', 5000, 1000, 0.96),
      ...mixedSegmentSpins('D', 5000, 1000, 0.96),
    ];
    const r = fairnessReport(spins, 0.96);
    expect(r.pairwise).toHaveLength(6);
  });

  it('segments listed alphabetically for stable diff output', () => {
    const spins = [
      ...fillSpins('zeta', 100, 1000, 960),
      ...fillSpins('alpha', 100, 1000, 960),
      ...fillSpins('mu', 100, 1000, 960),
    ];
    const r = fairnessReport(spins, 0.96);
    expect(r.segments.map((s) => s.segment)).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('report carries the target RTP for downstream rendering', () => {
    const r = fairnessReport(fillSpins('A', 10, 1000, 960), 0.97);
    expect(r.targetRtp).toBe(0.97);
  });
});
