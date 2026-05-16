/**
 * W152 Wave 51 — Supermeter state-switch tests.
 */

import { describe, it, expect } from 'vitest';
import {
  solveSupermeter,
  solveSupermeterFiniteHorizon,
  simulateSupermeter,
  type SupermeterConfig,
} from '../src/features/supermeter.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const baseCfg = (overrides: Partial<SupermeterConfig> = {}): SupermeterConfig => ({
  states: [
    { id: 'BASE', rtpPerSpin: 0.92 },
    { id: 'SUPER', rtpPerSpin: 1.10 },
  ],
  transitions: [
    { fromId: 'BASE', toId: 'BASE', probability: 0.98 },
    { fromId: 'BASE', toId: 'SUPER', probability: 0.02 },
    { fromId: 'SUPER', toId: 'BASE', probability: 0.10 },
    { fromId: 'SUPER', toId: 'SUPER', probability: 0.90 },
  ],
  initialStateId: 'BASE',
  ...overrides,
});

const threeStateCfg = (): SupermeterConfig => ({
  states: [
    { id: 'BASE', rtpPerSpin: 0.90 },
    { id: 'BOOST', rtpPerSpin: 1.00 },
    { id: 'SUPER', rtpPerSpin: 1.20 },
  ],
  transitions: [
    { fromId: 'BASE', toId: 'BASE', probability: 0.95 },
    { fromId: 'BASE', toId: 'BOOST', probability: 0.05 },
    { fromId: 'BOOST', toId: 'BASE', probability: 0.20 },
    { fromId: 'BOOST', toId: 'BOOST', probability: 0.70 },
    { fromId: 'BOOST', toId: 'SUPER', probability: 0.10 },
    { fromId: 'SUPER', toId: 'BOOST', probability: 0.30 },
    { fromId: 'SUPER', toId: 'SUPER', probability: 0.70 },
  ],
  initialStateId: 'BASE',
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects < 2 states', () => {
    expect(() =>
      solveSupermeter({ states: [{ id: 'X', rtpPerSpin: 1 }], transitions: [], initialStateId: 'X' }),
    ).toThrow();
  });
  it('rejects duplicate state ids', () => {
    expect(() =>
      solveSupermeter({
        states: [{ id: 'A', rtpPerSpin: 1 }, { id: 'A', rtpPerSpin: 1 }],
        transitions: [],
        initialStateId: 'A',
      }),
    ).toThrow();
  });
  it('rejects negative rtpPerSpin', () => {
    expect(() => solveSupermeter(baseCfg({
      states: [{ id: 'BASE', rtpPerSpin: -0.5 }, { id: 'SUPER', rtpPerSpin: 1 }],
    }))).toThrow();
  });
  it('rejects transition to unknown state', () => {
    expect(() =>
      solveSupermeter(baseCfg({
        transitions: [
          { fromId: 'BASE', toId: 'BASE', probability: 0.5 },
          { fromId: 'BASE', toId: 'GHOST', probability: 0.5 },
          { fromId: 'SUPER', toId: 'SUPER', probability: 1 },
        ],
      })),
    ).toThrow();
  });
  it('rejects probability outside [0,1]', () => {
    expect(() =>
      solveSupermeter(baseCfg({
        transitions: [
          { fromId: 'BASE', toId: 'BASE', probability: 1.5 },
          { fromId: 'SUPER', toId: 'SUPER', probability: 1 },
        ],
      })),
    ).toThrow();
  });
  it('rejects duplicate (from,to) pair', () => {
    expect(() =>
      solveSupermeter(baseCfg({
        transitions: [
          { fromId: 'BASE', toId: 'BASE', probability: 0.5 },
          { fromId: 'BASE', toId: 'BASE', probability: 0.5 },
          { fromId: 'SUPER', toId: 'SUPER', probability: 1 },
        ],
      })),
    ).toThrow();
  });
  it('rejects row not summing to 1', () => {
    expect(() =>
      solveSupermeter(baseCfg({
        transitions: [
          { fromId: 'BASE', toId: 'BASE', probability: 0.5 },
          { fromId: 'SUPER', toId: 'SUPER', probability: 1 },
        ],
      })),
    ).toThrow();
  });
  it('rejects unknown initialStateId', () => {
    expect(() => solveSupermeter(baseCfg({ initialStateId: 'GHOST' }))).toThrow();
  });
});

// ── Steady-state correctness ───────────────────────────────────────────────

describe('solveSupermeter — 2-state symmetric correctness', () => {
  it('stationary π for 2-state chain matches closed-form', () => {
    // For 2-state: π_BASE = p21 / (p12 + p21), π_SUPER = p12 / (p12 + p21)
    // p12 = P(BASE → SUPER) = 0.02
    // p21 = P(SUPER → BASE) = 0.10
    // π_BASE = 0.10 / 0.12 = 5/6 ≈ 0.8333
    // π_SUPER = 0.02 / 0.12 = 1/6 ≈ 0.1667
    const r = solveSupermeter(baseCfg());
    const byId: Record<string, number> = {};
    for (const s of r.stationaryDistribution) byId[s.id] = s.probability;
    expect(byId.BASE).toBeCloseTo(5 / 6, 6);
    expect(byId.SUPER).toBeCloseTo(1 / 6, 6);
  });
  it('stationary distribution sums to 1', () => {
    const r = solveSupermeter(baseCfg());
    const s = r.stationaryDistribution.reduce((a, x) => a + x.probability, 0);
    expect(s).toBeCloseTo(1, 10);
  });
  it('long-run RTP = Σ π_i × r_i', () => {
    const r = solveSupermeter(baseCfg());
    // (5/6) × 0.92 + (1/6) × 1.10 ≈ 0.95
    expect(r.expectedRtpPerSpinLongRun).toBeCloseTo((5 / 6) * 0.92 + (1 / 6) * 1.1, 6);
  });
  it('residual ‖π − πP‖∞ → 0', () => {
    const r = solveSupermeter(baseCfg());
    expect(r.residualInfNorm).toBeLessThan(1e-9);
  });
  it('chain is irreducible & aperiodic (self-loops exist)', () => {
    const r = solveSupermeter(baseCfg());
    expect(r.isIrreducible).toBe(true);
    expect(r.isAperiodic).toBe(true);
  });
});

describe('solveSupermeter — sojourn & first passage', () => {
  it('sojourn time = 1/(1−P[i][i])', () => {
    const r = solveSupermeter(baseCfg());
    const byId: Record<string, number> = {};
    for (const s of r.expectedSojournPerState) byId[s.id] = s.expectedSpins;
    // P[BASE][BASE] = 0.98 → 1/0.02 = 50
    expect(byId.BASE).toBeCloseTo(50, 8);
    // P[SUPER][SUPER] = 0.90 → 1/0.10 = 10
    expect(byId.SUPER).toBeCloseTo(10, 8);
  });
  it('first passage from BASE to SUPER = 1/p12 = 50 (for 2-state)', () => {
    // For 2-state chain starting at BASE, E[time to reach SUPER] = 1/p_BASE→SUPER
    const r = solveSupermeter(baseCfg());
    const toSuper = r.expectedFirstPassageFromInitial.find((x) => x.targetId === 'SUPER')!;
    expect(toSuper.expectedSpins).toBeCloseTo(1 / 0.02, 6);
  });
  it('first passage to initial state = 0', () => {
    const r = solveSupermeter(baseCfg());
    const toBase = r.expectedFirstPassageFromInitial.find((x) => x.targetId === 'BASE')!;
    expect(toBase.expectedSpins).toBe(0);
  });
});

// ── MC cross-validation ─────────────────────────────────────────────────────

describe('solveSupermeter — MC cross-validation', () => {
  it('long-run RTP matches MC at 500K spins (rel ≤ 1.5%)', () => {
    const cfg = baseCfg();
    const cf = solveSupermeter(cfg);
    const mc = simulateSupermeter(cfg, 500_000, 0xc0ffee);
    const rel = Math.abs(cf.expectedRtpPerSpinLongRun - mc.observedRtpPerSpin) / cf.expectedRtpPerSpinLongRun;
    expect(rel).toBeLessThan(0.015);
  });
  it('state proportions match stationary distribution', () => {
    const cfg = baseCfg();
    const cf = solveSupermeter(cfg);
    const mc = simulateSupermeter(cfg, 500_000, 0xbeefbabe);
    for (const s of cf.stationaryDistribution) {
      const obs = mc.observedStateProportions[s.id] ?? 0;
      expect(Math.abs(obs - s.probability)).toBeLessThan(0.01);
    }
  });
  it('3-state chain matches MC', () => {
    const cfg = threeStateCfg();
    const cf = solveSupermeter(cfg);
    const mc = simulateSupermeter(cfg, 500_000, 0xdecafbad);
    const rel = Math.abs(cf.expectedRtpPerSpinLongRun - mc.observedRtpPerSpin) / cf.expectedRtpPerSpinLongRun;
    expect(rel).toBeLessThan(0.015);
  });
});

// ── Finite horizon ─────────────────────────────────────────────────────────

describe('solveSupermeterFiniteHorizon', () => {
  it('stateDistribution at N=1 = first row of P from initial', () => {
    const cfg = baseCfg();
    const r = solveSupermeterFiniteHorizon(cfg, 1);
    const byId: Record<string, number> = {};
    for (const s of r.stateDistributionAtSpinN) byId[s.id] = s.probability;
    // After 1 step from BASE: P(BASE) = 0.98, P(SUPER) = 0.02
    expect(byId.BASE).toBeCloseTo(0.98, 10);
    expect(byId.SUPER).toBeCloseTo(0.02, 10);
  });
  it('expectedSpinsInState sums to N', () => {
    const r = solveSupermeterFiniteHorizon(baseCfg(), 100);
    const sum = r.expectedSpinsInStateInN.reduce((a, x) => a + x.spins, 0);
    expect(sum).toBeCloseTo(100, 6);
  });
  it('stateDistribution sums to 1', () => {
    const r = solveSupermeterFiniteHorizon(baseCfg(), 50);
    const s = r.stateDistributionAtSpinN.reduce((a, x) => a + x.probability, 0);
    expect(s).toBeCloseTo(1, 10);
  });
  it('finite-horizon converges to long-run RTP as N → ∞', () => {
    const cfg = baseCfg();
    const ss = solveSupermeter(cfg);
    const fh = solveSupermeterFiniteHorizon(cfg, 10000);
    const rel = Math.abs(fh.expectedRtpPerSpinInN - ss.expectedRtpPerSpinLongRun) / ss.expectedRtpPerSpinLongRun;
    expect(rel).toBeLessThan(0.01);
  });
  it('finite-horizon E[#triggers] grows with N', () => {
    const a = solveSupermeterFiniteHorizon(baseCfg(), 100);
    const b = solveSupermeterFiniteHorizon(baseCfg(), 500);
    const aS = a.expectedSpinsInStateInN.find((x) => x.id === 'SUPER')!.spins;
    const bS = b.expectedSpinsInStateInN.find((x) => x.id === 'SUPER')!.spins;
    expect(bS).toBeGreaterThan(aS);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('solveSupermeter — determinism', () => {
  it('identical inputs ⇒ bit-exact stationary distribution', () => {
    const a = solveSupermeter(baseCfg());
    const b = solveSupermeter(baseCfg());
    for (let i = 0; i < a.stationaryDistribution.length; i++) {
      expect(a.stationaryDistribution[i].probability).toBe(b.stationaryDistribution[i].probability);
    }
  });
  it('MC same seed ⇒ identical results', () => {
    const cfg = baseCfg();
    const a = simulateSupermeter(cfg, 10000, 42);
    const b = simulateSupermeter(cfg, 10000, 42);
    expect(a.observedSwitchCount).toBe(b.observedSwitchCount);
    expect(a.observedTotalRtp).toBe(b.observedTotalRtp);
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe('solveSupermeter — edges', () => {
  it('symmetric 2-state with equal transition rates ⇒ π = 0.5/0.5', () => {
    const cfg: SupermeterConfig = {
      states: [
        { id: 'A', rtpPerSpin: 1.0 },
        { id: 'B', rtpPerSpin: 1.0 },
      ],
      transitions: [
        { fromId: 'A', toId: 'A', probability: 0.5 },
        { fromId: 'A', toId: 'B', probability: 0.5 },
        { fromId: 'B', toId: 'A', probability: 0.5 },
        { fromId: 'B', toId: 'B', probability: 0.5 },
      ],
      initialStateId: 'A',
    };
    const r = solveSupermeter(cfg);
    const byId: Record<string, number> = {};
    for (const s of r.stationaryDistribution) byId[s.id] = s.probability;
    expect(byId.A).toBeCloseTo(0.5, 8);
    expect(byId.B).toBeCloseTo(0.5, 8);
  });
  it('all states with same RTP ⇒ expectedRtp = that RTP', () => {
    const cfg = baseCfg({
      states: [
        { id: 'BASE', rtpPerSpin: 0.95 },
        { id: 'SUPER', rtpPerSpin: 0.95 },
      ],
    });
    const r = solveSupermeter(cfg);
    expect(r.expectedRtpPerSpinLongRun).toBeCloseTo(0.95, 8);
  });
  it('high BASE self-loop (P[i][i] → 1) ⇒ near-infinite sojourn', () => {
    const cfg: SupermeterConfig = {
      states: [
        { id: 'BASE', rtpPerSpin: 1 },
        { id: 'SUPER', rtpPerSpin: 1 },
      ],
      transitions: [
        { fromId: 'BASE', toId: 'BASE', probability: 0.9999 },
        { fromId: 'BASE', toId: 'SUPER', probability: 0.0001 },
        { fromId: 'SUPER', toId: 'BASE', probability: 0.5 },
        { fromId: 'SUPER', toId: 'SUPER', probability: 0.5 },
      ],
      initialStateId: 'BASE',
    };
    const r = solveSupermeter(cfg);
    const baseSojourn = r.expectedSojournPerState.find((x) => x.id === 'BASE')!.expectedSpins;
    expect(baseSojourn).toBeCloseTo(10000, 0);
  });
});
