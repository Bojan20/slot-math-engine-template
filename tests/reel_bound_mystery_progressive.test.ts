/**
 * W152 Wave 181 — Reel-Bound Mystery Progressive Analyzer tests.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeReelBoundMysteryProgressive,
  simulateReelBoundMysteryProgressive,
  type ReelBoundMysteryProgressiveConfig,
} from '../src/features/reelBoundMysteryProgressive.js';

// Quick Hit Platinum-class: 5 reels, scatter weight ~5% per reel,
// 3-tier ladder (Mini=tier_3, Minor=tier_4, Major=tier_5).
const baseCfg: ReelBoundMysteryProgressiveConfig = {
  numReels: 5,
  perReelScatterPresenceProb: [0.30, 0.30, 0.30, 0.20, 0.10],
  minTier: 3,
  tierPayouts: [25, 250, 2500], // Mini, Minor, Major (× bet)
};

describe('analyzeReelBoundMysteryProgressive — validation', () => {
  it('rejects numReels < 2', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, numReels: 1, perReelScatterPresenceProb: [0.3] }),
    ).toThrow(/numReels/);
  });
  it('rejects non-integer numReels', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, numReels: 5.5 }),
    ).toThrow(/numReels/);
  });
  it('rejects perReelScatterPresenceProb length mismatch', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, perReelScatterPresenceProb: [0.3, 0.3] }),
    ).toThrow(/perReelScatterPresenceProb length/);
  });
  it('rejects p > 1', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({
        ...baseCfg,
        perReelScatterPresenceProb: [0.3, 0.3, 0.3, 0.3, 1.5],
      }),
    ).toThrow(/perReelScatterPresenceProb entries/);
  });
  it('rejects p < 0', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({
        ...baseCfg,
        perReelScatterPresenceProb: [0.3, 0.3, 0.3, 0.3, -0.1],
      }),
    ).toThrow(/perReelScatterPresenceProb entries/);
  });
  it('rejects minTier < 2', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, minTier: 1, tierPayouts: [1, 2, 3, 4, 5] }),
    ).toThrow(/minTier/);
  });
  it('rejects minTier > numReels', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, minTier: 6, tierPayouts: [] }),
    ).toThrow(/minTier/);
  });
  it('rejects tierPayouts length mismatch', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, tierPayouts: [25, 250] }),
    ).toThrow(/tierPayouts length/);
  });
  it('rejects negative tier payout', () => {
    expect(() =>
      analyzeReelBoundMysteryProgressive({ ...baseCfg, tierPayouts: [25, 250, -100] }),
    ).toThrow(/tierPayouts entries/);
  });
});

describe('analyzeReelBoundMysteryProgressive — prefix product math', () => {
  it('prefixProb[3] = ∏ first 3 probs = 0.30·0.30·0.30 = 0.027', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.tierBreakdown[0].prefixProb).toBeCloseTo(0.027, 10);
  });
  it('prefixProb[5] = ∏ all 5 probs = 0.30·0.30·0.30·0.20·0.10 = 0.00054', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.topTierProb).toBeCloseTo(0.00054, 10);
  });
  it('tierProb_3 = prefix_3 − prefix_4 = 0.027 − 0.0054 = 0.0216', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.tierBreakdown[0].tierProb).toBeCloseTo(0.0216, 10);
  });
  it('tierProb_4 = prefix_4 − prefix_5 = 0.0054 − 0.00054 = 0.00486', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.tierBreakdown[1].tierProb).toBeCloseTo(0.00486, 10);
  });
  it('tierProb_5 = prefix_5 (top tier) = 0.00054', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.tierBreakdown[2].tierProb).toBeCloseTo(0.00054, 10);
  });
});

describe('analyzeReelBoundMysteryProgressive — RTP aggregation', () => {
  it('expectedPayoutPerSpin = Σ tier_k · payout_k', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    // 0.0216·25 + 0.00486·250 + 0.00054·2500
    // = 0.540 + 1.215 + 1.350 = 3.105
    expect(r.expectedPayoutPerSpin).toBeCloseTo(3.105, 8);
  });
  it('tierBreakdown sum of rtpShare = expectedPayoutPerSpin', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    const sum = r.tierBreakdown.reduce((a, t) => a + t.rtpShare, 0);
    expect(sum).toBeCloseTo(r.expectedPayoutPerSpin, 10);
  });
  it('oneInNSpinsTopTier = 1 / topTierProb', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.oneInNSpinsTopTier).toBeCloseTo(1 / 0.00054, 4);
  });
  it('anyTierTriggerProb = prefixProb[kMin] = 0.027', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.anyTierTriggerProb).toBeCloseTo(0.027, 10);
  });
});

describe('analyzeReelBoundMysteryProgressive — monotonicity', () => {
  it('topTierProb decreases as reel-5 probability decreases', () => {
    const rLowReel5 = analyzeReelBoundMysteryProgressive({
      ...baseCfg,
      perReelScatterPresenceProb: [0.3, 0.3, 0.3, 0.2, 0.05],
    });
    const rHighReel5 = analyzeReelBoundMysteryProgressive({
      ...baseCfg,
      perReelScatterPresenceProb: [0.3, 0.3, 0.3, 0.2, 0.20],
    });
    expect(rHighReel5.topTierProb).toBeGreaterThan(rLowReel5.topTierProb);
  });
  it('expectedPayoutPerSpin increases as top-tier payout increases', () => {
    const rLow = analyzeReelBoundMysteryProgressive({ ...baseCfg, tierPayouts: [25, 250, 1000] });
    const rHigh = analyzeReelBoundMysteryProgressive({ ...baseCfg, tierPayouts: [25, 250, 5000] });
    expect(rHigh.expectedPayoutPerSpin).toBeGreaterThan(rLow.expectedPayoutPerSpin);
  });
  it('tier probs monotone non-increasing in tier-index (higher tier = rarer)', () => {
    const r = analyzeReelBoundMysteryProgressive({
      ...baseCfg,
      // For equal probs, tierProb_k = p^k·(1-p) sa p=0.3:
      perReelScatterPresenceProb: [0.3, 0.3, 0.3, 0.3, 0.3],
    });
    for (let i = 1; i < r.tierBreakdown.length; i++) {
      expect(r.tierBreakdown[i].tierProb).toBeLessThanOrEqual(r.tierBreakdown[i - 1].tierProb + 1e-12);
    }
  });
});

describe('analyzeReelBoundMysteryProgressive — Monte Carlo cross-validation', () => {
  it('MC expectedPayoutPerSpin within 5% of CF', () => {
    const cf = analyzeReelBoundMysteryProgressive(baseCfg);
    const mc = simulateReelBoundMysteryProgressive(baseCfg, 200_000, 0xa5a5);
    const rel = Math.abs(mc.observedExpectedPayoutPerSpin - cf.expectedPayoutPerSpin) /
      Math.max(cf.expectedPayoutPerSpin, 1e-9);
    expect(rel).toBeLessThan(0.05);
  });
  it('MC anyTierTriggerProb within 1pp of CF', () => {
    const cf = analyzeReelBoundMysteryProgressive(baseCfg);
    const mc = simulateReelBoundMysteryProgressive(baseCfg, 200_000, 0x1234);
    const abs = Math.abs(mc.observedAnyTierTriggerProb - cf.anyTierTriggerProb);
    expect(abs).toBeLessThan(0.01);
  });
  it('MC topTierProb within 0.2pp of CF (rare event)', () => {
    const cf = analyzeReelBoundMysteryProgressive(baseCfg);
    const mc = simulateReelBoundMysteryProgressive(baseCfg, 500_000, 0x5678);
    const abs = Math.abs(mc.observedTopTierProb - cf.topTierProb);
    expect(abs).toBeLessThan(0.002);
  });
  it('MC tier_3 freq within 1pp of CF', () => {
    const cf = analyzeReelBoundMysteryProgressive(baseCfg);
    const mc = simulateReelBoundMysteryProgressive(baseCfg, 200_000, 0x9abc);
    const tier3CF = cf.tierBreakdown[0].tierProb;
    const tier3MC = mc.observedTierFreqs[0].observedProb;
    expect(Math.abs(tier3MC - tier3CF)).toBeLessThan(0.01);
  });
});

describe('analyzeReelBoundMysteryProgressive — determinism', () => {
  it('two identical calls produce identical results', () => {
    const r1 = analyzeReelBoundMysteryProgressive(baseCfg);
    const r2 = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r1.expectedPayoutPerSpin).toBe(r2.expectedPayoutPerSpin);
    expect(r1.topTierProb).toBe(r2.topTierProb);
  });
  it('same seed → same MC result', () => {
    const m1 = simulateReelBoundMysteryProgressive(baseCfg, 5000, 0xdeadbeef);
    const m2 = simulateReelBoundMysteryProgressive(baseCfg, 5000, 0xdeadbeef);
    expect(m1.observedExpectedPayoutPerSpin).toBeCloseTo(m2.observedExpectedPayoutPerSpin, 12);
  });
});

describe('analyzeReelBoundMysteryProgressive — industry iconic configs', () => {
  it('SG Quick Hit Platinum 5-reel Mini/Minor/Major (p=[.3,.3,.3,.2,.1])', () => {
    const r = analyzeReelBoundMysteryProgressive(baseCfg);
    expect(r.tierBreakdown.length).toBe(3);
    expect(r.topTierProb).toBeCloseTo(0.00054, 8);
    expect(r.oneInNSpinsTopTier).toBeCloseTo(1851.85, 1); // 1/0.00054
  });
  it('Quick Hit Pro 9-tier extended ladder (p=[.4,.35,.30,.25,.20,.15,.10,.07,.05])', () => {
    const r = analyzeReelBoundMysteryProgressive({
      numReels: 9,
      perReelScatterPresenceProb: [0.4, 0.35, 0.30, 0.25, 0.20, 0.15, 0.10, 0.07, 0.05],
      minTier: 3,
      tierPayouts: [10, 50, 250, 1000, 5000, 25000, 100000], // 7 tiers (3..9)
    });
    expect(r.tierBreakdown.length).toBe(7); // tiers 3..9
    expect(r.topTierProb).toBeGreaterThan(0);
    expect(r.topTierProb).toBeLessThan(1e-4); // very rare
  });
  it('Quick Hit Black Gold 5-tier sa Black Gold cap (high top tier payout)', () => {
    const r = analyzeReelBoundMysteryProgressive({
      numReels: 5,
      perReelScatterPresenceProb: [0.25, 0.25, 0.20, 0.15, 0.08],
      minTier: 3,
      tierPayouts: [20, 200, 10000], // Mini/Minor/Black Gold = 10K× bet
    });
    expect(r.maxPayoutX).toBe(10000);
    // E[payout] should be dominated by top tier despite rarity
    expect(r.expectedPayoutPerSpin).toBeGreaterThan(0.5);
  });
  it('Bally Smokin 7s degenerate 1-tier (only top tier, all reels equal prob)', () => {
    const r = analyzeReelBoundMysteryProgressive({
      numReels: 5,
      perReelScatterPresenceProb: [0.20, 0.20, 0.20, 0.20, 0.20],
      minTier: 5, // only top tier
      tierPayouts: [5000],
    });
    expect(r.tierBreakdown.length).toBe(1);
    expect(r.topTierProb).toBeCloseTo(Math.pow(0.20, 5), 12);
  });
  it('left-anchored cascade: middle-reel break does NOT trigger any tier', () => {
    // If reel 2 = 0, can never reach tier 3+; expectedPayout = 0
    const r = analyzeReelBoundMysteryProgressive({
      ...baseCfg,
      perReelScatterPresenceProb: [0.3, 0, 0.3, 0.3, 0.3], // reel 2 dead
    });
    expect(r.anyTierTriggerProb).toBeCloseTo(0, 10);
    expect(r.expectedPayoutPerSpin).toBeCloseTo(0, 10);
  });
});
