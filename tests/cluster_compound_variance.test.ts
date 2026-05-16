// W152 Wave 102 — Cluster Compound Variance tests
//
// Closed-form solver za "cluster cascade compound payout" mehaniku
// (Sweet Bonanza / Reactoonz / Jammin' Jars style). Wald's compound-sum
// identity: Var[Y_total] = E[N]·Var[Y_step] + Var[N]·E[Y_step]².
//
// Tests cover:
//   - input validation (chainPmf/clusterPmf normalization, paytable shape)
//   - closed-form correctness (analytical match for known cases)
//   - explicit ↔ geometric agreement (same model, two input forms)
//   - chain pmf builder roundtrip (buildGeometricChainPmf ↔ analytical)
//   - MC cross-validation (CF vs sim @ 100K episodes, rel err < 1%)
//   - determinism (same seed → same MC output)
//   - degenerate cases (pKill=1, zero-payout, single-cluster pmf)
//   - industry use-cases (Sweet-Bonanza-style + Reactoonz-style)

import { describe, it, expect } from 'vitest';
import {
  solveClusterCompoundExplicit,
  solveClusterCompoundGeometric,
  simulateClusterCompoundExplicit,
  simulateClusterCompoundGeometric,
  buildGeometricChainPmf,
  type ClusterCompoundConfigExplicit,
  type ClusterCompoundConfigGeometric,
} from '../src/features/clusterCompoundVariance.js';

const SEED = 12345;

describe('Wave 102 — Cluster Compound Variance', () => {
  // ── input validation ─────────────────────────────────────────────────────
  describe('validation', () => {
    it('rejects chainPmf that does not sum to 1', () => {
      expect(() =>
        solveClusterCompoundExplicit({
          chainPmf: [0.3, 0.3, 0.3], // 0.9, not 1.0
          clusterPmf: [1.0],
          paytable: [0],
        }),
      ).toThrow(/chainPmf must sum to 1/);
    });

    it('rejects clusterPmf that does not sum to 1', () => {
      expect(() =>
        solveClusterCompoundExplicit({
          chainPmf: [0.5, 0.5],
          clusterPmf: [0.2, 0.5, 0.1], // 0.8
          paytable: [0, 1, 2],
        }),
      ).toThrow(/clusterPmf must sum to 1/);
    });

    it('rejects paytable shorter than clusterPmf', () => {
      expect(() =>
        solveClusterCompoundExplicit({
          chainPmf: [1],
          clusterPmf: [0.3, 0.3, 0.4],
          paytable: [0, 1], // missing index 2
        }),
      ).toThrow(/paytable length .* must be ≥ clusterPmf length/);
    });

    it('rejects negative paytable values', () => {
      expect(() =>
        solveClusterCompoundExplicit({
          chainPmf: [1],
          clusterPmf: [1],
          paytable: [-0.5],
        }),
      ).toThrow(/paytable values must be finite and non-negative/);
    });

    it('rejects geometric pKill ≤ 0', () => {
      expect(() =>
        solveClusterCompoundGeometric({
          pKill: 0,
          clusterPmf: [1],
          paytable: [0],
        }),
      ).toThrow(/pKill must be in \(0, 1\]/);
    });

    it('rejects geometric pKill > 1', () => {
      expect(() =>
        solveClusterCompoundGeometric({
          pKill: 1.5,
          clusterPmf: [1],
          paytable: [0],
        }),
      ).toThrow(/pKill must be in \(0, 1\]/);
    });
  });

  // ── closed-form correctness ──────────────────────────────────────────────
  describe('closed-form correctness', () => {
    it('zero-payout paytable → 0 expected payout, 0 variance', () => {
      const cf = solveClusterCompoundExplicit({
        chainPmf: [0.1, 0.5, 0.4],
        clusterPmf: [0.5, 0.5],
        paytable: [0, 0],
      });
      expect(cf.expectedPayoutPerStep).toBe(0);
      expect(cf.variancePayoutPerStep).toBe(0);
      expect(cf.expectedTotalPayoutX).toBe(0);
      expect(cf.varianceTotalPayout).toBe(0);
    });

    it('chain length N=0 deterministic → 0 expected payout regardless of paytable', () => {
      const cf = solveClusterCompoundExplicit({
        chainPmf: [1, 0, 0],
        clusterPmf: [0.1, 0.9],
        paytable: [0, 100],
      });
      expect(cf.expectedChainLength).toBe(0);
      expect(cf.varianceChainLength).toBe(0);
      expect(cf.expectedTotalPayoutX).toBe(0);
      expect(cf.varianceTotalPayout).toBe(0);
      expect(cf.probEmptyEpisode).toBe(1);
    });

    it('chain length N=1 deterministic → E[Y]=μ_K, Var[Y]=σ²_K', () => {
      // chainPmf = [0, 1] → P(N=1)=1, P(N=0)=0
      // clusterPmf = [0.5, 0.5] → P(K=0)=0.5, P(K=1)=0.5
      // paytable = [0, 10] → f(0)=0, f(1)=10
      // μ_Y = 0.5·0 + 0.5·10 = 5
      // σ²_Y = 0.5·0² + 0.5·100 − 25 = 50 − 25 = 25
      const cf = solveClusterCompoundExplicit({
        chainPmf: [0, 1],
        clusterPmf: [0.5, 0.5],
        paytable: [0, 10],
      });
      expect(cf.expectedPayoutPerStep).toBeCloseTo(5, 12);
      expect(cf.variancePayoutPerStep).toBeCloseTo(25, 12);
      expect(cf.expectedChainLength).toBe(1);
      expect(cf.varianceChainLength).toBe(0);
      // Wald: E[Y] = 1·5 = 5; Var[Y] = 1·25 + 0·25 = 25
      expect(cf.expectedTotalPayoutX).toBeCloseTo(5, 12);
      expect(cf.varianceTotalPayout).toBeCloseTo(25, 12);
    });

    it('chain length N constant (deterministic) → simple scaling of cluster moments', () => {
      // chainPmf concentrates at n=3
      // For deterministic N=3: E[Y] = 3·μ, Var[Y] = 3·σ²
      const cf = solveClusterCompoundExplicit({
        chainPmf: [0, 0, 0, 1],
        clusterPmf: [0.5, 0.5],
        paytable: [0, 10],
      });
      expect(cf.expectedTotalPayoutX).toBeCloseTo(15, 12);
      expect(cf.varianceTotalPayout).toBeCloseTo(75, 12); // 3·25
    });

    it('geometric chain pKill=1 → P(N=0)=1, episode always empty', () => {
      const cf = solveClusterCompoundGeometric({
        pKill: 1,
        clusterPmf: [0.5, 0.5],
        paytable: [0, 100],
      });
      expect(cf.expectedChainLength).toBe(0);
      expect(cf.varianceChainLength).toBe(0);
      expect(cf.probEmptyEpisode).toBe(1);
      expect(cf.expectedTotalPayoutX).toBe(0);
    });

    it('geometric chain pKill=0.5 → E[N]=1, Var[N]=2', () => {
      // q=0.5, E[N]=q/pKill=1, Var[N]=q/pKill²=2
      const cf = solveClusterCompoundGeometric({
        pKill: 0.5,
        clusterPmf: [1],
        paytable: [10],
      });
      expect(cf.expectedChainLength).toBeCloseTo(1, 12);
      expect(cf.varianceChainLength).toBeCloseTo(2, 12);
    });
  });

  // ── explicit ↔ geometric agreement ───────────────────────────────────────
  describe('explicit ↔ geometric agreement', () => {
    it('buildGeometricChainPmf + explicit solver ≈ geometric solver', () => {
      const pKill = 0.3;
      const clusterPmf = [0.4, 0.3, 0.2, 0.1];
      const paytable = [0, 1, 5, 20];

      const chainPmf = buildGeometricChainPmf(pKill, 200); // large cap → minimal tail residual
      const cfExplicit = solveClusterCompoundExplicit({ chainPmf, clusterPmf, paytable });
      const cfGeometric = solveClusterCompoundGeometric({ pKill, clusterPmf, paytable });

      // E[N] match (geometric tail cap is large enough)
      expect(cfExplicit.expectedChainLength).toBeCloseTo(cfGeometric.expectedChainLength, 6);
      expect(cfExplicit.expectedTotalPayoutX).toBeCloseTo(cfGeometric.expectedTotalPayoutX, 6);
      expect(cfExplicit.varianceTotalPayout).toBeCloseTo(cfGeometric.varianceTotalPayout, 4);
    });

    it('buildGeometricChainPmf mass sums to 1', () => {
      const pmf = buildGeometricChainPmf(0.2, 100);
      const sum = pmf.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    });

    it('buildGeometricChainPmf rejects pKill ≤ 0', () => {
      expect(() => buildGeometricChainPmf(0)).toThrow(/pKill must be in/);
    });

    it('buildGeometricChainPmf rejects cap < 1', () => {
      expect(() => buildGeometricChainPmf(0.5, 0)).toThrow(/cap must be ≥ 1/);
    });
  });

  // ── MC cross-validation ──────────────────────────────────────────────────
  describe('MC cross-validation', () => {
    const cfg: ClusterCompoundConfigGeometric = {
      pKill: 0.4,
      clusterPmf: [0.5, 0.3, 0.15, 0.05],
      paytable: [0, 2, 10, 50],
    };

    it('CF mean ≈ MC mean within 1% rel error @ 100K episodes', () => {
      const cf = solveClusterCompoundGeometric(cfg);
      const mc = simulateClusterCompoundGeometric(cfg, { episodes: 100_000, seed: SEED });
      const relErr = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
      expect(relErr).toBeLessThan(0.01);
    });

    it('CF stdDev ≈ MC stdDev within 3% rel error @ 100K episodes', () => {
      const cf = solveClusterCompoundGeometric(cfg);
      const mc = simulateClusterCompoundGeometric(cfg, { episodes: 100_000, seed: SEED });
      const relErr = Math.abs(cf.stdDevTotalPayout - mc.observedStdDevPayoutX) / cf.stdDevTotalPayout;
      expect(relErr).toBeLessThan(0.03);
    });

    it('CF E[N] ≈ MC observed mean chain length', () => {
      const cf = solveClusterCompoundGeometric(cfg);
      const mc = simulateClusterCompoundGeometric(cfg, { episodes: 100_000, seed: SEED });
      const relErr = Math.abs(cf.expectedChainLength - mc.observedMeanChainLength) / cf.expectedChainLength;
      expect(relErr).toBeLessThan(0.02);
    });

    it('CF P(empty) ≈ MC observed empty rate', () => {
      const cf = solveClusterCompoundGeometric(cfg);
      const mc = simulateClusterCompoundGeometric(cfg, { episodes: 100_000, seed: SEED });
      expect(Math.abs(cf.probEmptyEpisode - mc.observedEmptyRate)).toBeLessThan(0.01);
    });

    it('explicit-form MC also matches CF (uses buildGeometricChainPmf)', () => {
      const chainPmf = buildGeometricChainPmf(cfg.pKill, 200);
      const cfgEx: ClusterCompoundConfigExplicit = { chainPmf, clusterPmf: cfg.clusterPmf, paytable: cfg.paytable };
      const cf = solveClusterCompoundExplicit(cfgEx);
      const mc = simulateClusterCompoundExplicit(cfgEx, { episodes: 100_000, seed: SEED });
      const relErr = Math.abs(cf.expectedTotalPayoutX - mc.observedMeanPayoutX) / cf.expectedTotalPayoutX;
      expect(relErr).toBeLessThan(0.01);
    });
  });

  // ── determinism ──────────────────────────────────────────────────────────
  describe('determinism', () => {
    it('same seed produces identical MC output', () => {
      const cfg: ClusterCompoundConfigGeometric = {
        pKill: 0.3,
        clusterPmf: [0.6, 0.3, 0.1],
        paytable: [0, 1, 10],
      };
      const mc1 = simulateClusterCompoundGeometric(cfg, { episodes: 10_000, seed: SEED });
      const mc2 = simulateClusterCompoundGeometric(cfg, { episodes: 10_000, seed: SEED });
      expect(mc1.observedMeanPayoutX).toBe(mc2.observedMeanPayoutX);
      expect(mc1.observedStdDevPayoutX).toBe(mc2.observedStdDevPayoutX);
      expect(mc1.observedMeanChainLength).toBe(mc2.observedMeanChainLength);
    });

    it('different seeds produce different MC outputs', () => {
      const cfg: ClusterCompoundConfigGeometric = {
        pKill: 0.3,
        clusterPmf: [0.6, 0.3, 0.1],
        paytable: [0, 1, 10],
      };
      const mc1 = simulateClusterCompoundGeometric(cfg, { episodes: 10_000, seed: SEED });
      const mc2 = simulateClusterCompoundGeometric(cfg, { episodes: 10_000, seed: SEED + 1 });
      expect(mc1.observedMeanPayoutX).not.toBe(mc2.observedMeanPayoutX);
    });
  });

  // ── industry use-cases ───────────────────────────────────────────────────
  describe('industry use-cases', () => {
    // Sweet-Bonanza-style: pure cluster cascade with persistent-multiplier
    // factored OUT (Wave 89 handles multiplier; Wave 102 handles cluster cascade).
    // Cluster pmf approximates a heavy-tailed cluster size distribution.
    it('Sweet-Bonanza-style 6×5 cluster cascade has finite RTP and finite variance', () => {
      // Approx pKill ~ 0.65 → mean chain ~ 0.54
      // Cluster size distribution heavily skewed to 8-12 symbols, tail to 50+
      const clusterPmf = [
        0.45, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,    // 0-7: no win
        0.20, 0.12, 0.08, 0.05, 0.04, 0.025, 0.02, 0.01, 0.005, // 8-16
        ...Array(23).fill(0).map((_, i) => 0.04 / 23), // 17-39 (small tail)
      ];
      // Normalize (small float drift)
      const total = clusterPmf.reduce((a, b) => a + b, 0);
      const normPmf = clusterPmf.map((p) => p / total);
      const paytable = [
        0, 0, 0, 0, 0, 0, 0, 0,        // 0-7
        0.25, 0.4, 0.5, 1, 1.5, 2, 4, 8, 12,
        ...Array(23).fill(0).map((_, i) => 25 + i * 15), // ramps to large mults
      ];

      const cf = solveClusterCompoundGeometric({
        pKill: 0.65,
        clusterPmf: normPmf,
        paytable,
      });

      expect(cf.expectedTotalPayoutX).toBeGreaterThan(0);
      expect(cf.expectedTotalPayoutX).toBeLessThan(100); // bounded RTP per spin (cluster part only)
      expect(cf.varianceTotalPayout).toBeGreaterThan(0);
      expect(cf.coefficientOfVariation).toBeGreaterThan(1); // high-vol cluster game
      expect(cf.probEmptyEpisode).toBeCloseTo(0.65, 6); // pKill
    });

    // Reactoonz-style: cluster + quantum leap is OUT (state machine), but
    // base cluster mechanic is Wave 102. With higher chain survival prob
    // (lower pKill) → bigger expected chains, higher variance.
    it('Reactoonz-style higher chain survival → higher variance per episode', () => {
      const clusterPmf = [0.5, 0.3, 0.15, 0.05];
      const paytable = [0, 1, 5, 20];

      const cfLow = solveClusterCompoundGeometric({
        pKill: 0.7, // short chains
        clusterPmf,
        paytable,
      });
      const cfHigh = solveClusterCompoundGeometric({
        pKill: 0.3, // long chains
        clusterPmf,
        paytable,
      });

      expect(cfHigh.expectedChainLength).toBeGreaterThan(cfLow.expectedChainLength);
      expect(cfHigh.varianceTotalPayout).toBeGreaterThan(cfLow.varianceTotalPayout);
      expect(cfHigh.expectedTotalPayoutX).toBeGreaterThan(cfLow.expectedTotalPayoutX);
    });
  });

  // ── monotonicity properties ──────────────────────────────────────────────
  describe('monotonicity', () => {
    it('lower pKill (longer chains) → higher E[Y]', () => {
      const clusterPmf = [0.5, 0.5];
      const paytable = [0, 10];
      const cfHi = solveClusterCompoundGeometric({ pKill: 0.8, clusterPmf, paytable });
      const cfLo = solveClusterCompoundGeometric({ pKill: 0.2, clusterPmf, paytable });
      expect(cfLo.expectedTotalPayoutX).toBeGreaterThan(cfHi.expectedTotalPayoutX);
    });

    it('higher cluster payout values → linearly higher E[Y]', () => {
      const cfg = (scale: number): ClusterCompoundConfigGeometric => ({
        pKill: 0.5,
        clusterPmf: [0.5, 0.5],
        paytable: [0, 10 * scale],
      });
      const cf1 = solveClusterCompoundGeometric(cfg(1));
      const cf2 = solveClusterCompoundGeometric(cfg(2));
      const cf5 = solveClusterCompoundGeometric(cfg(5));
      expect(cf2.expectedTotalPayoutX).toBeCloseTo(2 * cf1.expectedTotalPayoutX, 12);
      expect(cf5.expectedTotalPayoutX).toBeCloseTo(5 * cf1.expectedTotalPayoutX, 12);
    });

    it('higher cluster payout values → quadratically higher Var[Y]', () => {
      // Var[Y] = E[N]·Var[f(K)] + Var[N]·E[f(K)]². Both terms scale as scale².
      const cfg = (scale: number): ClusterCompoundConfigGeometric => ({
        pKill: 0.5,
        clusterPmf: [0.5, 0.5],
        paytable: [0, 10 * scale],
      });
      const cf1 = solveClusterCompoundGeometric(cfg(1));
      const cf2 = solveClusterCompoundGeometric(cfg(2));
      expect(cf2.varianceTotalPayout).toBeCloseTo(4 * cf1.varianceTotalPayout, 10);
    });
  });

  // ── readback sanity ──────────────────────────────────────────────────────
  describe('readback sanity', () => {
    it('explicit solver reports chainPmfMass and clusterPmfMass', () => {
      const cf = solveClusterCompoundExplicit({
        chainPmf: [0.5, 0.5],
        clusterPmf: [0.3, 0.7],
        paytable: [0, 10],
      });
      expect(cf.chainPmfMass).toBeCloseTo(1, 12);
      expect(cf.clusterPmfMass).toBeCloseTo(1, 12);
    });

    it('coefficient of variation is finite when expectedTotalPayoutX > 0', () => {
      const cf = solveClusterCompoundGeometric({
        pKill: 0.5,
        clusterPmf: [0.5, 0.5],
        paytable: [0, 10],
      });
      expect(Number.isFinite(cf.coefficientOfVariation)).toBe(true);
      expect(cf.coefficientOfVariation).toBeGreaterThan(0);
    });

    it('coefficient of variation is NaN when expectedTotalPayoutX = 0', () => {
      const cf = solveClusterCompoundExplicit({
        chainPmf: [1, 0],
        clusterPmf: [1],
        paytable: [0],
      });
      expect(Number.isNaN(cf.coefficientOfVariation)).toBe(true);
    });
  });
});
