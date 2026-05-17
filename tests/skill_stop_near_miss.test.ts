/**
 * W152 Wave 175 — Skill-Stop Near-Miss Rate Analyzer tests.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeSkillStopNearMiss,
  simulateSkillStopNearMiss,
  type SkillStopNearMissConfig,
} from '../src/features/skillStopNearMiss.js';

// Baseline cfg: N=20, M=2 jackpot per reel, K=1 near-miss band → baseline NM = 4/20 = 0.20
// Observed = 0.20 → inflation = 1.0 (compliant under UKGC tolerance 1.0 + 0.02 noise)
const baseCfg: SkillStopNearMissConfig = {
  symbolsPerReel: 20,
  jackpotSymbolsPerReel: 2,
  nearMissBand: 1,
  observedNearMissRatePerReel: 0.20,
  numReels: 5,
};

describe('analyzeSkillStopNearMiss — validation', () => {
  it('rejects symbolsPerReel < 2', () => {
    expect(() => analyzeSkillStopNearMiss({ ...baseCfg, symbolsPerReel: 1 })).toThrow(
      /symbolsPerReel/,
    );
  });
  it('rejects non-integer symbolsPerReel', () => {
    expect(() => analyzeSkillStopNearMiss({ ...baseCfg, symbolsPerReel: 5.5 })).toThrow(
      /symbolsPerReel/,
    );
  });
  it('rejects jackpotSymbolsPerReel < 1', () => {
    expect(() => analyzeSkillStopNearMiss({ ...baseCfg, jackpotSymbolsPerReel: 0 })).toThrow(
      /jackpotSymbolsPerReel/,
    );
  });
  it('rejects jackpotSymbolsPerReel ≥ symbolsPerReel', () => {
    expect(() =>
      analyzeSkillStopNearMiss({ ...baseCfg, symbolsPerReel: 5, jackpotSymbolsPerReel: 5 }),
    ).toThrow(/jackpotSymbolsPerReel/);
  });
  it('rejects nearMissBand < 1', () => {
    expect(() => analyzeSkillStopNearMiss({ ...baseCfg, nearMissBand: 0 })).toThrow(
      /nearMissBand/,
    );
  });
  it('rejects observedNearMissRate > 1', () => {
    expect(() =>
      analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 1.5 }),
    ).toThrow(/observedNearMissRate/);
  });
  it('rejects observedNearMissRate < 0', () => {
    expect(() =>
      analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: -0.1 }),
    ).toThrow(/observedNearMissRate/);
  });
  it('rejects numReels < 1', () => {
    expect(() => analyzeSkillStopNearMiss({ ...baseCfg, numReels: 0 })).toThrow(/numReels/);
  });
  it('rejects negative customInflationTolerance', () => {
    expect(() =>
      analyzeSkillStopNearMiss({ ...baseCfg, customInflationTolerance: -0.1 }),
    ).toThrow(/customInflationTolerance/);
  });
  it('rejects noiseTolerance > 0.5', () => {
    expect(() => analyzeSkillStopNearMiss({ ...baseCfg, noiseTolerance: 0.8 })).toThrow(
      /noiseTolerance/,
    );
  });
});

describe('analyzeSkillStopNearMiss — closed-form baseline', () => {
  it('baselineWinRate = M / N (2/20 = 0.10)', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.baselineWinRate).toBeCloseTo(0.10, 10);
  });
  it('baselineNearMissRate = 2K·M/N (2·1·2/20 = 0.20)', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.baselineNearMissRate).toBeCloseTo(0.20, 10);
  });
  it('inflationRatio = observed / baseline (0.20 / 0.20 = 1.0)', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.inflationRatio).toBeCloseTo(1.0, 10);
  });
  it('K=2 band doubles baseline (2·2·2/20 = 0.40)', () => {
    const r = analyzeSkillStopNearMiss({ ...baseCfg, nearMissBand: 2 });
    expect(r.baselineNearMissRate).toBeCloseTo(0.40, 10);
  });
  it('baselineNearMissRate clamps to 1 for tiny reel (N=4 K=2 M=1 → 4 > 1)', () => {
    const r = analyzeSkillStopNearMiss({
      ...baseCfg,
      symbolsPerReel: 4,
      jackpotSymbolsPerReel: 1,
      nearMissBand: 2,
    });
    expect(r.baselineNearMissRate).toBeLessThanOrEqual(1);
  });
});

describe('analyzeSkillStopNearMiss — UKGC regulatory flag', () => {
  it('UKGC compliant when inflation ≤ 1.0 + noise', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.regulatoryFlag).toBe(false);
    expect(r.regimeUsed).toBe('UKGC');
    expect(r.regulatoryToleranceApplied).toBe(1.0);
  });
  it('UKGC FLAGS when inflation > 1.0 + noise (deliberate enhancement)', () => {
    // Observed = 0.30 → inflation 1.5 — clear flag
    const r = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0.30 });
    expect(r.regulatoryFlag).toBe(true);
    expect(r.severityScore).toBeGreaterThan(0);
  });
  it('UKGC no-flag within noise tolerance (inflation = 1.01)', () => {
    // observed = 0.202 → inflation 1.01 (under 1.02 noise tol)
    const r = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0.202 });
    expect(r.regulatoryFlag).toBe(false);
  });
});

describe('analyzeSkillStopNearMiss — JP Pachislot 風営法 regulatory flag', () => {
  it('JP_PACHISLOT compliant when inflation ≤ 1.5', () => {
    // observed = 0.30 → inflation 1.5 (= JP tolerance), within
    const r = analyzeSkillStopNearMiss({
      ...baseCfg,
      observedNearMissRatePerReel: 0.30,
      regulatoryRegime: 'JP_PACHISLOT',
    });
    expect(r.regulatoryFlag).toBe(false);
    expect(r.regulatoryToleranceApplied).toBe(1.5);
  });
  it('JP_PACHISLOT FLAGS when inflation > 1.5 + noise (license violation)', () => {
    // observed = 0.40 → inflation 2.0 — flagged
    const r = analyzeSkillStopNearMiss({
      ...baseCfg,
      observedNearMissRatePerReel: 0.40,
      regulatoryRegime: 'JP_PACHISLOT',
    });
    expect(r.regulatoryFlag).toBe(true);
  });
});

describe('analyzeSkillStopNearMiss — AU NCPF regulatory flag', () => {
  it('AU_NCPF compliant when inflation ≤ 1.2', () => {
    // observed = 0.24 → inflation 1.2 (= AU tolerance), within
    const r = analyzeSkillStopNearMiss({
      ...baseCfg,
      observedNearMissRatePerReel: 0.24,
      regulatoryRegime: 'AU_NCPF',
    });
    expect(r.regulatoryFlag).toBe(false);
    expect(r.regulatoryToleranceApplied).toBe(1.2);
  });
  it('AU_NCPF FLAGS when inflation > 1.2 + noise (disclosure required)', () => {
    // observed = 0.30 → inflation 1.5 — flagged for AU
    const r = analyzeSkillStopNearMiss({
      ...baseCfg,
      observedNearMissRatePerReel: 0.30,
      regulatoryRegime: 'AU_NCPF',
    });
    expect(r.regulatoryFlag).toBe(true);
  });
});

describe('analyzeSkillStopNearMiss — frustration metrics', () => {
  it('frustrationRatio = observed / baselineWin (0.20/0.10 = 2.0)', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.frustrationRatio).toBeCloseTo(2.0, 8);
  });
  it('frustrationRatio = 2K when inflation = 1 (baseline)', () => {
    // baseline: nearMiss/win = (2K·M/N) / (M/N) = 2K
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.frustrationRatio).toBeCloseTo(2 * baseCfg.nearMissBand, 8);
  });
  it('expectedFrustrationEventsPerSpin > 0 when observed > baselineWin', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.expectedFrustrationEventsPerSpin).toBeGreaterThan(0);
  });
  it('expectedFrustrationEventsPerSpin = 0 when observed = 0', () => {
    const r = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0 });
    expect(r.expectedFrustrationEventsPerSpin).toBe(0);
  });
});

describe('analyzeSkillStopNearMiss — multi-reel aggregation', () => {
  it('anyReelNearMissProb = 1 − (1 − p_NM)^R', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    const expected = 1 - Math.pow(1 - 0.20, 5);
    expect(r.anyReelNearMissProb).toBeCloseTo(expected, 10);
  });
  it('anyReelNearMissProb monotone in numReels', () => {
    const r3 = analyzeSkillStopNearMiss({ ...baseCfg, numReels: 3 });
    const r7 = analyzeSkillStopNearMiss({ ...baseCfg, numReels: 7 });
    expect(r7.anyReelNearMissProb).toBeGreaterThan(r3.anyReelNearMissProb);
  });
  it('allButOneWinNearMissProb = R · winRate^(R−1) · observed', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    const winRate = 0.10;
    const expected = 5 * Math.pow(winRate, 4) * 0.20;
    expect(r.allButOneWinNearMissProb).toBeCloseTo(expected, 10);
  });
});

describe('analyzeSkillStopNearMiss — disclosure text', () => {
  it('disclosure text contains "COMPLIANT" when flag = false', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.disclosureText).toContain('COMPLIANT');
  });
  it('disclosure text contains "FLAG" when flag = true', () => {
    const r = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0.40 });
    expect(r.disclosureText).toContain('FLAG');
  });
  it('disclosure text contains regulatory citation for each regime', () => {
    const rUk = analyzeSkillStopNearMiss(baseCfg);
    expect(rUk.disclosureText).toContain('UKGC RTS 12');
    const rJp = analyzeSkillStopNearMiss({ ...baseCfg, regulatoryRegime: 'JP_PACHISLOT' });
    expect(rJp.disclosureText).toContain('風営法');
  });
});

describe('analyzeSkillStopNearMiss — monotonicity', () => {
  it('inflationRatio strictly increases in observedNearMissRate', () => {
    const r1 = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0.15 });
    const r2 = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0.25 });
    expect(r2.inflationRatio).toBeGreaterThan(r1.inflationRatio);
  });
  it('severityScore = max(0, inflation − tolerance)', () => {
    const r = analyzeSkillStopNearMiss({ ...baseCfg, observedNearMissRatePerReel: 0.30 });
    expect(r.severityScore).toBeCloseTo(0.5, 8); // inflation = 1.5, tol = 1.0
  });
  it('severityScore = 0 when compliant', () => {
    const r = analyzeSkillStopNearMiss(baseCfg);
    expect(r.severityScore).toBe(0);
  });
});

describe('analyzeSkillStopNearMiss — Monte Carlo cross-validation', () => {
  it('MC anyReelNearMiss within 2pp of CF', () => {
    const cf = analyzeSkillStopNearMiss(baseCfg);
    const mc = simulateSkillStopNearMiss(baseCfg, 50_000, 0xa5a5);
    const abs = Math.abs(mc.observedAnyReelNearMissProb - cf.anyReelNearMissProb);
    expect(abs).toBeLessThan(0.02);
  });
  it('MC allButOneWinNearMiss within 1pp of CF', () => {
    const cf = analyzeSkillStopNearMiss(baseCfg);
    const mc = simulateSkillStopNearMiss(baseCfg, 200_000, 0x1234);
    const abs = Math.abs(mc.observedAllButOneWinNearMissProb - cf.allButOneWinNearMissProb);
    expect(abs).toBeLessThan(0.01);
  });
  it('MC frustrationRatio within 20% of CF', () => {
    const cf = analyzeSkillStopNearMiss(baseCfg);
    const mc = simulateSkillStopNearMiss(baseCfg, 50_000, 0x5678);
    const rel = Math.abs(mc.observedFrustrationRatio - cf.frustrationRatio) / cf.frustrationRatio;
    expect(rel).toBeLessThan(0.20);
  });
});

describe('analyzeSkillStopNearMiss — determinism', () => {
  it('two identical calls produce identical results', () => {
    const r1 = analyzeSkillStopNearMiss(baseCfg);
    const r2 = analyzeSkillStopNearMiss(baseCfg);
    expect(r1.inflationRatio).toBe(r2.inflationRatio);
    expect(r1.regulatoryFlag).toBe(r2.regulatoryFlag);
  });
  it('same seed → same MC result', () => {
    const m1 = simulateSkillStopNearMiss(baseCfg, 1000, 0xdeadbeef);
    const m2 = simulateSkillStopNearMiss(baseCfg, 1000, 0xdeadbeef);
    expect(m1.observedAnyReelNearMissProb).toBeCloseTo(m2.observedAnyReelNearMissProb, 12);
  });
});

describe('analyzeSkillStopNearMiss — industry use-cases', () => {
  it('UKGC Vegas-style 5-reel slot N=22 M=1 K=1 RNG-uniform → COMPLIANT', () => {
    const r = analyzeSkillStopNearMiss({
      symbolsPerReel: 22,
      jackpotSymbolsPerReel: 1,
      nearMissBand: 1,
      observedNearMissRatePerReel: 2 / 22, // baseline match
      numReels: 5,
    });
    expect(r.regulatoryFlag).toBe(false);
  });
  it('JP Pachislot 3-reel N=21 M=1 K=1, 1.5× inflated → JP COMPLIANT but UKGC FLAG', () => {
    const cfg: SkillStopNearMissConfig = {
      symbolsPerReel: 21,
      jackpotSymbolsPerReel: 1,
      nearMissBand: 1,
      observedNearMissRatePerReel: (2 / 21) * 1.5, // 1.5× baseline
      numReels: 3,
    };
    const rJp = analyzeSkillStopNearMiss({ ...cfg, regulatoryRegime: 'JP_PACHISLOT' });
    const rUk = analyzeSkillStopNearMiss({ ...cfg, regulatoryRegime: 'UKGC' });
    expect(rJp.regulatoryFlag).toBe(false);
    expect(rUk.regulatoryFlag).toBe(true);
  });
  it('Reid-1986 classic near-miss inflation 2× baseline → ALL regimes FLAG', () => {
    const cfg: SkillStopNearMissConfig = {
      symbolsPerReel: 20,
      jackpotSymbolsPerReel: 2,
      nearMissBand: 1,
      observedNearMissRatePerReel: 0.40, // 2× baseline of 0.20
      numReels: 5,
    };
    for (const regime of ['UKGC', 'JP_PACHISLOT', 'AU_NCPF', 'AGCO'] as const) {
      const r = analyzeSkillStopNearMiss({ ...cfg, regulatoryRegime: regime });
      expect(r.regulatoryFlag, `${regime} should FLAG at 2× baseline`).toBe(true);
    }
  });
});
