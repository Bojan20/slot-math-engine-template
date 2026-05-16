/**
 * W152 Wave 136 — Locked/Held Reels During FS Analyzer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveLockedReelsDuringFs,
  simulateLockedReelsDuringFs,
  type LockedReelsDuringFsConfig,
} from '../src/features/lockedReelsDuringFs.js';

const baseCfg = (overrides: Partial<LockedReelsDuringFsConfig> = {}): LockedReelsDuringFsConfig => ({
  totalReels: 5,
  heldReels: 3,
  freeSpins: 8,
  freshScatterProbabilityPerReel: 0.15,
  retriggerScatterThreshold: 5,
  scatterPayoutPerSymbolX: 0,
  ...overrides,
});

describe('validation', () => {
  it('rejects totalReels < 2', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ totalReels: 1 }))).toThrow();
  });
  it('rejects heldReels > totalReels', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ heldReels: 10 }))).toThrow();
  });
  it('rejects heldReels < 0', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ heldReels: -1 }))).toThrow();
  });
  it('rejects freeSpins < 1', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ freeSpins: 0 }))).toThrow();
  });
  it('rejects q < 0', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ freshScatterProbabilityPerReel: -0.1 }))).toThrow();
  });
  it('rejects q > 1', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ freshScatterProbabilityPerReel: 1.5 }))).toThrow();
  });
  it('rejects retriggerScatterThreshold > totalReels', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ retriggerScatterThreshold: 6 }))).toThrow();
  });
  it('rejects negative scatterPayout', () => {
    expect(() => solveLockedReelsDuringFs(baseCfg({ scatterPayoutPerSymbolX: -5 }))).toThrow();
  });
});

describe('retrigger probability', () => {
  it('P_re = P(Bin(N-K, q) ≥ T-K) when fresh needed > 0', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    // N=5, K=3, q=0.15, T=5 → need = 2, nonHeld = 2
    // P(Bin(2, 0.15) ≥ 2) = 0.15² = 0.0225
    expect(r.probRetriggerPerSpin).toBeCloseTo(0.0225, 6);
  });
  it('P_re = 1 when held already ≥ threshold', () => {
    const r = solveLockedReelsDuringFs(baseCfg({
      heldReels: 5,
      totalReels: 5,
      retriggerScatterThreshold: 5,
    }));
    expect(r.probRetriggerPerSpin).toBe(1);
  });
  it('P_re = 0 when need > nonHeld (impossible)', () => {
    const r = solveLockedReelsDuringFs(baseCfg({
      heldReels: 0,
      retriggerScatterThreshold: 5,
      freshScatterProbabilityPerReel: 0,
    }));
    expect(r.probRetriggerPerSpin).toBe(0);
  });
  it('higher q → higher P_re', () => {
    const a = solveLockedReelsDuringFs(baseCfg({ freshScatterProbabilityPerReel: 0.05 }));
    const b = solveLockedReelsDuringFs(baseCfg({ freshScatterProbabilityPerReel: 0.30 }));
    expect(b.probRetriggerPerSpin).toBeGreaterThan(a.probRetriggerPerSpin);
  });
  it('higher K (more held) → higher P_re (less fresh needed)', () => {
    const a = solveLockedReelsDuringFs(baseCfg({ heldReels: 2, retriggerScatterThreshold: 5 }));
    const b = solveLockedReelsDuringFs(baseCfg({ heldReels: 4, retriggerScatterThreshold: 5 }));
    expect(b.probRetriggerPerSpin).toBeGreaterThan(a.probRetriggerPerSpin);
  });
});

describe('aggregate metrics', () => {
  it('E[retriggers] = M · P_re', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.expectedRetriggersAcrossFs).toBeCloseTo(8 * 0.0225, 6);
  });
  it('P(any retrigger) = 1 − (1 − P_re)^M', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.probAnyRetriggerAcrossFs).toBeCloseTo(1 - Math.pow(1 - 0.0225, 8), 6);
  });
  it('Var[retriggers] = M·P_re·(1−P_re)', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.varianceRetriggers).toBeCloseTo(8 * 0.0225 * (1 - 0.0225), 6);
  });
  it('all aggregate probs ∈ [0, 1]', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.probRetriggerPerSpin).toBeGreaterThanOrEqual(0);
    expect(r.probRetriggerPerSpin).toBeLessThanOrEqual(1);
    expect(r.probAnyRetriggerAcrossFs).toBeGreaterThanOrEqual(0);
    expect(r.probAnyRetriggerAcrossFs).toBeLessThanOrEqual(1);
  });
});

describe('scatter expectations', () => {
  it('E[fresh scatters per spin] = (N-K)·q', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.expectedFreshScattersPerSpin).toBeCloseTo(2 * 0.15, 8);
  });
  it('E[total scatters per spin] = K + (N-K)·q', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.expectedTotalScattersPerSpin).toBeCloseTo(3 + 0.3, 8);
  });
  it('E[total scatter pay across FS] correct', () => {
    const r = solveLockedReelsDuringFs(baseCfg({ scatterPayoutPerSymbolX: 5 }));
    // M·(K + (N-K)·q)·payout = 8·3.3·5 = 132
    expect(r.expectedTotalScatterPayAcrossFs).toBeCloseTo(132, 6);
  });
  it('default scatter pay = 0 when not provided', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    expect(r.expectedTotalScatterPayAcrossFs).toBe(0);
  });
});

describe('time-to-first retrigger', () => {
  it('E[T_re truncated] = (1 − (1−P_re)^M)/P_re for non-trivial P_re', () => {
    const r = solveLockedReelsDuringFs(baseCfg());
    const expected = (1 - Math.pow(1 - 0.0225, 8)) / 0.0225;
    expect(r.expectedTimeToFirstRetrigger).toBeCloseTo(expected, 6);
  });
  it('E[T_re] = 1 when P_re = 1 (instant retrigger)', () => {
    const r = solveLockedReelsDuringFs(baseCfg({
      heldReels: 5,
      retriggerScatterThreshold: 5,
    }));
    expect(r.expectedTimeToFirstRetrigger).toBe(1);
  });
  it('E[T_re] = M when P_re = 0 (never retrigger)', () => {
    const r = solveLockedReelsDuringFs(baseCfg({
      heldReels: 0,
      retriggerScatterThreshold: 5,
      freshScatterProbabilityPerReel: 0,
    }));
    expect(r.expectedTimeToFirstRetrigger).toBe(8);
  });
});

describe('monotonicity', () => {
  it('more FS spins → higher P(any retrigger)', () => {
    const a = solveLockedReelsDuringFs(baseCfg({ freeSpins: 5 }));
    const b = solveLockedReelsDuringFs(baseCfg({ freeSpins: 50 }));
    expect(b.probAnyRetriggerAcrossFs).toBeGreaterThan(a.probAnyRetriggerAcrossFs);
  });
  it('more FS spins → higher E[retriggers]', () => {
    const a = solveLockedReelsDuringFs(baseCfg({ freeSpins: 5 }));
    const b = solveLockedReelsDuringFs(baseCfg({ freeSpins: 50 }));
    expect(b.expectedRetriggersAcrossFs).toBeGreaterThan(a.expectedRetriggersAcrossFs);
  });
});

describe('MC cross-validation', () => {
  it('MC E[retriggers] matches CF (abs ≤ 0.05 at 50K episodes)', () => {
    const cfg = baseCfg();
    const cf = solveLockedReelsDuringFs(cfg);
    const mc = simulateLockedReelsDuringFs(cfg, 50_000, 0xdeadbeef);
    expect(Math.abs(cf.expectedRetriggersAcrossFs - mc.observedMeanRetriggersPerEpisode)).toBeLessThan(0.05);
  });
  it('MC P(any retrigger) matches CF (abs ≤ 0.02 at 50K)', () => {
    const cfg = baseCfg();
    const cf = solveLockedReelsDuringFs(cfg);
    const mc = simulateLockedReelsDuringFs(cfg, 50_000, 0xcafe1234);
    expect(Math.abs(cf.probAnyRetriggerAcrossFs - mc.observedAnyRetriggerFraction)).toBeLessThan(0.02);
  });
  it('MC fresh scatters per spin matches CF (rel ≤ 5% at 50K)', () => {
    const cfg = baseCfg();
    const cf = solveLockedReelsDuringFs(cfg);
    const mc = simulateLockedReelsDuringFs(cfg, 50_000, 0xbeefcafe);
    const rel = Math.abs(cf.expectedFreshScattersPerSpin - mc.observedMeanFreshScattersPerSpin) /
      Math.max(cf.expectedFreshScattersPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
});

describe('determinism', () => {
  it('CF same → identical', () => {
    const a = solveLockedReelsDuringFs(baseCfg());
    const b = solveLockedReelsDuringFs(baseCfg());
    expect(a.expectedRetriggersAcrossFs).toBe(b.expectedRetriggersAcrossFs);
  });
  it('MC same seed → identical', () => {
    const a = simulateLockedReelsDuringFs(baseCfg(), 1000, 42);
    const b = simulateLockedReelsDuringFs(baseCfg(), 1000, 42);
    expect(a.observedMeanRetriggersPerEpisode).toBe(b.observedMeanRetriggersPerEpisode);
  });
});

describe('industry use-cases', () => {
  it('Pragmatic Wolf Gold style: 5-reel sa 3 held + 8 FS', () => {
    const r = solveLockedReelsDuringFs({
      totalReels: 5,
      heldReels: 3,
      freeSpins: 8,
      freshScatterProbabilityPerReel: 0.20,
      retriggerScatterThreshold: 5,
    });
    expect(r.probAnyRetriggerAcrossFs).toBeGreaterThan(0);
    expect(r.expectedRetriggersAcrossFs).toBeGreaterThan(0);
  });
  it('Buffalo King: 6-reel sa 4 held + 10 FS', () => {
    const r = solveLockedReelsDuringFs({
      totalReels: 6,
      heldReels: 4,
      freeSpins: 10,
      freshScatterProbabilityPerReel: 0.18,
      retriggerScatterThreshold: 5, // need just 1 more
    });
    expect(r.probRetriggerPerSpin).toBeGreaterThan(0.3); // single reel sa 0.18 prob easy
  });
  it('John Hunter Tomb style: 4-trigger 6-reel, long 15 FS', () => {
    const r = solveLockedReelsDuringFs({
      totalReels: 6,
      heldReels: 4,
      freeSpins: 15,
      freshScatterProbabilityPerReel: 0.12,
      retriggerScatterThreshold: 6, // need 2 more from 2 reels
    });
    expect(r.expectedRetriggersAcrossFs).toBeGreaterThan(0);
  });
});
