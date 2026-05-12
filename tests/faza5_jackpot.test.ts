/**
 * Faza 5 — Jackpot Manager KATs.
 *
 * Tests for JackpotManager and analyzeJackpot in
 * src/features/jackpotManager.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  JackpotManager,
  analyzeJackpot,
  type JackpotTierConfig,
} from '../src/features/jackpotManager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fixedConfig(overrides: Partial<JackpotTierConfig> = {}): JackpotTierConfig {
  return {
    id: 'MINI',
    name: 'Mini Jackpot',
    kind: 'fixed',
    trigger: { kind: 'random_pick', probability: 0.01 },
    seed_amount_x: 1000,
    ...overrides,
  };
}

function progressiveConfig(overrides: Partial<JackpotTierConfig> = {}): JackpotTierConfig {
  return {
    id: 'MAJOR',
    name: 'Major Jackpot',
    kind: 'progressive',
    trigger: { kind: 'random_pick', probability: 0.001 },
    seed_amount_x: 100,
    contribution_rate: 0.01,
    ...overrides,
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('JackpotManager', () => {
  // ── Test 1: fixed jackpot hits when probability === 1 ─────────────────────
  it('fixed jackpot hits when probability=1', () => {
    const config = fixedConfig({ trigger: { kind: 'random_pick', probability: 1.0 } });
    const mgr = new JackpotManager([config]);

    // rngVal=0.5 < 1.0 → triggers
    const hits = mgr.onSpin([0.5], 0);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.tierId).toBe('MINI');
  });

  // ── Test 2: fixed jackpot no hit when probability === 0 ───────────────────
  it('fixed jackpot no hit when probability=0', () => {
    const config = fixedConfig({ trigger: { kind: 'random_pick', probability: 0.0 } });
    const mgr = new JackpotManager([config]);

    // rngVal = 0.0 — condition is rng < 0.0, which is false for any non-negative rng
    const hits = mgr.onSpin([0.0], 0);
    expect(hits).toHaveLength(0);
  });

  // ── Test 3: fixed jackpot correct payout ──────────────────────────────────
  it('fixed jackpot correct payout equals seed_amount_x', () => {
    const config = fixedConfig({
      seed_amount_x: 1000,
      trigger: { kind: 'random_pick', probability: 1.0 },
    });
    const mgr = new JackpotManager([config]);

    const hits = mgr.onSpin([0.5], 0);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.payout).toBe(1000);
  });

  // ── Test 4: progressive pool accumulates ──────────────────────────────────
  it('progressive pool accumulates with contributions', () => {
    const config = progressiveConfig({
      seed_amount_x: 100,
      contribution_rate: 0.01,
      // probability = 0 so it never hits during this test
      trigger: { kind: 'random_pick', probability: 0 },
    });
    const mgr = new JackpotManager([config]);

    // Contribute for 1000 spins, wager = 1 per spin
    for (let i = 0; i < 1000; i++) {
      mgr.contributeAll(1);
    }

    const metrics = mgr.getMetrics();
    const m = metrics[0];
    expect(m).toBeDefined();
    // Pool should have grown from 100 by ~10 (1000 × 0.01 = 10)
    expect(m!.currentPoolX).toBeCloseTo(110, 0);
  });

  // ── Test 5: progressive resets on hit ────────────────────────────────────
  it('progressive pool resets to seed after hit', () => {
    const config = progressiveConfig({
      seed_amount_x: 100,
      contribution_rate: 0.01,
      trigger: { kind: 'random_pick', probability: 1.0 }, // always hits
    });
    const mgr = new JackpotManager([config]);

    // Grow the pool a little.
    for (let i = 0; i < 500; i++) mgr.contributeAll(1);

    // Pool is now > seed. Force a hit.
    const hits = mgr.onSpin([0.0], 0); // 0.0 < 1.0 → hits
    expect(hits).toHaveLength(1);
    expect(hits[0]!.payout).toBeGreaterThan(100); // paid out grown pool

    // After the hit, pool should be reset to seed.
    const metrics = mgr.getMetrics();
    expect(metrics[0]!.currentPoolX).toBe(100);
  });

  // ── Test 6: hold_and_win_full trigger via recordHnwHit ───────────────────
  it('hold_and_win_full triggers via recordHnwHit with correct payout', () => {
    const config: JackpotTierConfig = {
      id: 'GRAND',
      name: 'Grand',
      kind: 'fixed',
      trigger: { kind: 'hold_and_win_full' },
      seed_amount_x: 5000,
    };
    const mgr = new JackpotManager([config]);

    // Should not trigger via onSpin.
    const onSpinHits = mgr.onSpin([0.0], 99999);
    expect(onSpinHits).toHaveLength(0);

    // Must trigger via recordHnwHit.
    const hit = mgr.recordHnwHit('GRAND');
    expect(hit).not.toBeNull();
    expect(hit!.payout).toBe(5000);
    expect(hit!.tierId).toBe('GRAND');
  });

  // ── Test 7: analyzeJackpot returns correct expectedRtp ───────────────────
  it('analyzeJackpot returns correct expectedRtp', () => {
    const config = fixedConfig({
      trigger: { kind: 'random_pick', probability: 0.0001 },
      seed_amount_x: 5000,
    });

    const result = analyzeJackpot(config);
    expect(result).not.toBeNull();
    // expectedRtp = p × v = 0.0001 × 5000 = 0.5
    expect(result!.expectedRtp).toBeCloseTo(0.5, 6);
    // expectedInterval = 1 / 0.0001 = 10000
    expect(result!.expectedInterval).toBeCloseTo(10000, 0);
  });

  // ── Test 8: analyzeJackpot returns null for win_multiplier_threshold ──────
  it('analyzeJackpot returns null for win_multiplier_threshold', () => {
    const config = fixedConfig({
      trigger: { kind: 'win_multiplier_threshold', min_win_x: 100 },
    });
    const result = analyzeJackpot(config);
    expect(result).toBeNull();
  });

  // ── Test 9: metrics avgInterval calculation ───────────────────────────────
  it('metrics avgInterval equals totalSpins / hits', () => {
    const config = fixedConfig({
      trigger: { kind: 'random_pick', probability: 1.0 }, // always hits
    });
    const mgr = new JackpotManager([config]);

    // Record 100 spins and trigger a hit on each.
    for (let i = 0; i < 100; i++) {
      mgr.recordSpin();
      mgr.onSpin([0.5], 0); // always hits
    }

    const metrics = mgr.getMetrics();
    const m = metrics[0]!;
    expect(m.hits).toBe(100);
    // avgInterval = 100 spins / 100 hits = 1
    expect(m.avgInterval).toBeCloseTo(1, 6);
  });

  // ── Test 10: multiple tiers — only one triggers ───────────────────────────
  it('multiple tiers: only the triggered tier returns a hit', () => {
    const tier0 = fixedConfig({
      id: 'TIER_A',
      trigger: { kind: 'random_pick', probability: 1.0 }, // always hits
    });
    const tier1 = fixedConfig({
      id: 'TIER_B',
      trigger: { kind: 'random_pick', probability: 0.0 }, // never hits
    });

    const mgr = new JackpotManager([tier0, tier1]);

    // rngVals[0]=0.5 → TIER_A triggers (0.5 < 1.0)
    // rngVals[1]=0.5 → TIER_B does not (0.5 is NOT < 0.0)
    const hits = mgr.onSpin([0.5, 0.5], 0);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tierId).toBe('TIER_A');
  });
});

describe('analyzeJackpot', () => {
  it('analyzeJackpot returns null for hold_and_win_full', () => {
    const config = fixedConfig({ trigger: { kind: 'hold_and_win_full' } });
    expect(analyzeJackpot(config)).toBeNull();
  });

  it('analyzeJackpot returns null for undefined probability', () => {
    const config = fixedConfig({ trigger: { kind: 'random_pick' } }); // no probability
    expect(analyzeJackpot(config)).toBeNull();
  });

  it('analyzeJackpot returns zeros when probability=0', () => {
    const config = fixedConfig({
      trigger: { kind: 'random_pick', probability: 0 },
      seed_amount_x: 1000,
    });
    const result = analyzeJackpot(config);
    expect(result).not.toBeNull();
    expect(result!.expectedRtp).toBe(0);
    expect(result!.expectedInterval).toBe(Infinity);
    expect(result!.rtpStdDev).toBe(0);
  });

  it('analyzeJackpot stdDev is positive for valid probability', () => {
    const config = fixedConfig({
      trigger: { kind: 'symbol_combo', probability: 0.01 },
      seed_amount_x: 500,
    });
    const result = analyzeJackpot(config);
    expect(result).not.toBeNull();
    expect(result!.rtpStdDev).toBeGreaterThan(0);
  });
});
