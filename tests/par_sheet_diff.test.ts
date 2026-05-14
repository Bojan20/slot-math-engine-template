/**
 * W152 P1-8 — PAR sheet diff (versioning aware).
 *
 * Covers:
 *   * Identical sheets → clean diff (no flags raised).
 *   * RTP shift above noise → `rtpChanged` + `requiresRecertification`.
 *   * Volatility category bump → triggers re-cert.
 *   * Jurisdiction added/removed → triggers re-cert.
 *   * Max-win cap change → triggers re-cert.
 *   * Jackpot list change (by id) → triggers re-cert.
 *   * Hit-rate drift only → operator review, NOT re-cert.
 *   * Schema-version mismatch → throws.
 *   * `formatDiffHeadline` produces the expected one-liners.
 */

import { describe, it, expect } from 'vitest';
import {
  diffParSheets,
  formatDiffHeadline,
} from '../src/math/par-sheet/diff.js';
import type { PARSheet } from '../src/statistics/parSheet.js';

function basePar(): PARSheet {
  return {
    schemaVersion: '1.0.0',
    meta: {
      gameId: 'fixture-001',
      gameVersion: '1.0.0',
      engineVersion: '0.4.0',
      generatedAtUtc: '2026-05-14T20:00:00Z',
      totalSpins: 1_000_000,
      seedsUsed: 16,
      rngKind: 'pcg64',
    },
    rtp: {
      totalRtpPct: 96.0,
      baseRtpPct: 60.0,
      freeSpinsRtpPct: 25.0,
      holdAndWinRtpPct: 11.0,
      cascadeRtpPct: 0,
      jackpotRtpPct: 0,
      targetRtpPct: 96.0,
      rtpTolerancePct: 0.5,
      withinTolerance: true,
    },
    hitFrequency: {
      overallHitRatePct: 32.0,
      featureFreq: { free_spins: 200, hold_and_win: 500 },
      avgFsSpins: 11.5,
      avgHnwRespins: 3.2,
    },
    volatility: {
      cv: 6.5,
      variance: 42.0,
      maxWinX: 5000,
      category: 'HIGH',
    },
    winDistribution: [],
    jackpots: [],
    compliance: {
      jurisdictions: ['UKGC', 'MGA'],
      rtpRangeRequired: [0.92, 0.97],
      rtpWithinRequired: true,
      maxWinCapRequired: 10000,
      maxWinWithinCap: true,
      nearMissRule: 'must_be_random',
      ldwDisclosure: true,
      sessionTimeDisplay: true,
    },
    statistics: {
      ci95Low: 95.9,
      ci95High: 96.1,
      stdError: 0.05,
      stdDevAcrossSeeds: 0.04,
      confidenceAdequate: true,
    },
  };
}

describe('W152 P1-8 — PAR sheet diff', () => {
  it('identical sheets diff cleanly (no flags raised)', () => {
    const a = basePar();
    const b = basePar();
    const d = diffParSheets(a, b);
    expect(d.summary.rtpChanged).toBe(false);
    expect(d.summary.requiresRecertification).toBe(false);
    expect(d.summary.requiresOperatorReview).toBe(false);
    expect(d.details.rtp).toEqual({});
    expect(d.details.hitFrequency).toEqual({});
  });

  it('RTP +0.18 pp triggers re-certification', () => {
    const a = basePar();
    const b = basePar();
    b.rtp.totalRtpPct = 96.18;
    b.meta.gameVersion = '1.1.0';
    const d = diffParSheets(a, b);
    expect(d.summary.rtpChanged).toBe(true);
    expect(d.summary.requiresRecertification).toBe(true);
    expect(d.details.rtp.totalRtpPct).toBeCloseTo(0.18, 5);
  });

  it('RTP noise (<0.005 pp) is ignored', () => {
    const a = basePar();
    const b = basePar();
    b.rtp.totalRtpPct = 96.0 + 0.003;
    const d = diffParSheets(a, b);
    expect(d.summary.rtpChanged).toBe(false);
    expect(d.details.rtp.totalRtpPct).toBeUndefined();
  });

  it('volatility category bump triggers re-cert', () => {
    const a = basePar();
    const b = basePar();
    b.volatility.category = 'EXTREME';
    const d = diffParSheets(a, b);
    expect(d.summary.volatilityCategoryChanged).toBe(true);
    expect(d.summary.requiresRecertification).toBe(true);
    expect(d.details.volatility.category).toEqual({
      previous: 'HIGH',
      next: 'EXTREME',
    });
  });

  it('jurisdiction added triggers re-cert with explicit added set', () => {
    const a = basePar();
    const b = basePar();
    b.compliance.jurisdictions = ['UKGC', 'MGA', 'ADM'];
    const d = diffParSheets(a, b);
    expect(d.summary.complianceChanged).toBe(true);
    expect(d.summary.requiresRecertification).toBe(true);
    expect(d.details.compliance.jurisdictionsAdded).toEqual(['ADM']);
    expect(d.details.compliance.jurisdictionsRemoved).toBeUndefined();
  });

  it('jurisdiction removed triggers re-cert', () => {
    const a = basePar();
    const b = basePar();
    b.compliance.jurisdictions = ['UKGC'];
    const d = diffParSheets(a, b);
    expect(d.summary.complianceChanged).toBe(true);
    expect(d.summary.requiresRecertification).toBe(true);
    expect(d.details.compliance.jurisdictionsRemoved).toEqual(['MGA']);
  });

  it('max-win cap shift triggers re-cert', () => {
    const a = basePar();
    const b = basePar();
    b.volatility.maxWinX = 7500;
    const d = diffParSheets(a, b);
    expect(d.summary.maxWinChanged).toBe(true);
    expect(d.summary.requiresRecertification).toBe(true);
    expect(d.details.volatility.maxWinX).toBe(2500);
  });

  it('jackpot list change triggers re-cert', () => {
    const a = basePar();
    const b = basePar();
    a.jackpots = [{ id: 'GRAND', totalPaid: 0 } as PARSheet['jackpots'][number]];
    b.jackpots = [
      { id: 'GRAND', totalPaid: 0 } as PARSheet['jackpots'][number],
      { id: 'MAJOR', totalPaid: 0 } as PARSheet['jackpots'][number],
    ];
    const d = diffParSheets(a, b);
    expect(d.summary.jackpotsChanged).toBe(true);
    expect(d.summary.requiresRecertification).toBe(true);
  });

  it('hit-rate drift alone → operator review, NOT re-cert', () => {
    const a = basePar();
    const b = basePar();
    b.hitFrequency.overallHitRatePct = 33.0; // +1 pp
    const d = diffParSheets(a, b);
    expect(d.summary.requiresOperatorReview).toBe(true);
    expect(d.summary.requiresRecertification).toBe(false);
    expect(d.details.hitFrequency.overallHitRatePct).toBe(1);
  });

  it('feature frequency change is captured per-feature', () => {
    const a = basePar();
    const b = basePar();
    b.hitFrequency.featureFreq = { free_spins: 195, hold_and_win: 500 };
    const d = diffParSheets(a, b);
    expect(d.details.hitFrequency.featureFreq).toEqual({
      free_spins: { previous: 200, next: 195 },
    });
  });

  it('schema-version mismatch throws', () => {
    const a = basePar();
    const b = basePar();
    b.schemaVersion = '2.0.0';
    expect(() => diffParSheets(a, b)).toThrow(/schema mismatch/);
  });

  it('headline formats clean / RE-REQUIRED / review-needed correctly', () => {
    const a = basePar();
    const cleanDiff = diffParSheets(a, basePar());
    expect(formatDiffHeadline(cleanDiff)).toContain('clean');

    const certB = basePar();
    certB.rtp.totalRtpPct = 96.5;
    certB.meta.gameVersion = '2.0.0';
    const certDiff = diffParSheets(a, certB);
    const headline = formatDiffHeadline(certDiff);
    expect(headline).toContain('cert RE-REQUIRED');
    expect(headline).toContain('RTP +0.5');

    const reviewB = basePar();
    reviewB.hitFrequency.overallHitRatePct = 33.0;
    const reviewDiff = diffParSheets(a, reviewB);
    expect(formatDiffHeadline(reviewDiff)).toContain('review needed');
  });

  it('jackpots ordered differently → no diff (sorted compare)', () => {
    const a = basePar();
    const b = basePar();
    a.jackpots = [
      { id: 'GRAND', totalPaid: 0 } as PARSheet['jackpots'][number],
      { id: 'MAJOR', totalPaid: 0 } as PARSheet['jackpots'][number],
    ];
    b.jackpots = [
      { id: 'MAJOR', totalPaid: 0 } as PARSheet['jackpots'][number],
      { id: 'GRAND', totalPaid: 0 } as PARSheet['jackpots'][number],
    ];
    const d = diffParSheets(a, b);
    expect(d.summary.jackpotsChanged).toBe(false);
  });
});
