// W152 Wave 184 — Colossal Reels Wild-Transfer Two-Grid Aggregator vitest specs
// (65. solver, L&W M7 P0 GAP CLOSURE — Spartacus family + 50+ WMS land-based titles).

import { describe, it, expect } from 'vitest';
import {
  analyzeColossalReelsWildTransfer,
  simulateColossalReelsWildTransfer,
  type ColossalReelsWildTransferConfig,
} from '../src/features/colossalReelsWildTransfer.js';

const baseCfg: ColossalReelsWildTransferConfig = {
  numReels: 5,
  perReelMainWildProb: [0.10, 0.10, 0.12, 0.10, 0.10],
  probTransferToColossal: 0.85,
  payoutMainGivenWildReels: [0, 0, 0.5, 5, 50, 500],
  payoutColossalGivenWildReels: [0, 0, 1, 10, 100, 1000],
};

describe('Wave 184 — Colossal Reels Wild-Transfer Two-Grid Aggregator', () => {
  describe('validation', () => {
    it('rejects numReels < 1', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({ ...baseCfg, numReels: 0 }),
      ).toThrow(/numReels must be integer ≥ 1/);
    });

    it('rejects perReelMainWildProb wrong length', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({ ...baseCfg, perReelMainWildProb: [0.1, 0.1] }),
      ).toThrow(/perReelMainWildProb must have length/);
    });

    it('rejects perReelMainWildProb outside [0,1]', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({
          ...baseCfg,
          perReelMainWildProb: [0.1, 0.1, 1.5, 0.1, 0.1],
        }),
      ).toThrow(/must be ∈/);
    });

    it('rejects probTransferToColossal outside [0,1]', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: -0.1 }),
      ).toThrow(/probTransferToColossal must be ∈/);
      expect(() =>
        analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 1.1 }),
      ).toThrow(/probTransferToColossal must be ∈/);
    });

    it('rejects payoutMain wrong length', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({
          ...baseCfg,
          payoutMainGivenWildReels: [0, 0, 0.5, 5],
        }),
      ).toThrow(/payoutMainGivenWildReels must have length/);
    });

    it('rejects negative payouts', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({
          ...baseCfg,
          payoutMainGivenWildReels: [0, 0, -1, 5, 50, 500],
        }),
      ).toThrow(/must be ≥ 0/);
    });

    it('rejects jointBonusPayoutMatrix wrong size', () => {
      expect(() =>
        analyzeColossalReelsWildTransfer({
          ...baseCfg,
          jointBonusPayoutMatrix: [[0, 0]],
        }),
      ).toThrow(/jointBonusPayoutMatrix must be/);
    });
  });

  describe('closed-form correctness', () => {
    it('pmfWildReelsMain sums to 1', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      const s = r.pmfWildReelsMain.reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 9);
    });

    it('pmfWildReelsColossal sums to 1', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      const s = r.pmfWildReelsColossal.reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 9);
    });

    it('joint PMF sums to 1', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      let s = 0;
      for (const row of r.jointPmfWildReels) for (const v of row) s += v;
      expect(s).toBeCloseTo(1, 9);
    });

    it('joint PMF row k sums to pmfMain[k]', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      for (let k = 0; k <= baseCfg.numReels; k++) {
        const rowSum = r.jointPmfWildReels[k].reduce((a, b) => a + b, 0);
        expect(rowSum).toBeCloseTo(r.pmfWildReelsMain[k], 9);
      }
    });

    it('joint PMF column j sums to pmfCol[j]', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      const Np1 = baseCfg.numReels + 1;
      for (let j = 0; j < Np1; j++) {
        let colSum = 0;
        for (let k = 0; k < Np1; k++) colSum += r.jointPmfWildReels[k][j];
        expect(colSum).toBeCloseTo(r.pmfWildReelsColossal[j], 9);
      }
    });

    it('E[K_col] = q_t · E[K_main] (law of total expectation)', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      expect(r.expectedWildReelsColossal).toBeCloseTo(
        baseCfg.probTransferToColossal * r.expectedWildReelsMain,
        9,
      );
    });

    it('Var[K_col] = q(1−q)·E[K_main] + q²·Var[K_main]', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      const q = baseCfg.probTransferToColossal;
      const expected =
        q * (1 - q) * r.expectedWildReelsMain + q * q * r.varianceWildReelsMain;
      expect(r.varianceWildReelsColossal).toBeCloseTo(expected, 9);
    });

    it('q_t = 0 → K_col = 0 always', () => {
      const r = analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 0 });
      expect(r.pmfWildReelsColossal[0]).toBeCloseTo(1, 9);
      expect(r.expectedWildReelsColossal).toBeCloseTo(0, 9);
    });

    it('q_t = 1 → K_col = K_main deterministically', () => {
      const r = analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 1 });
      for (let k = 0; k <= baseCfg.numReels; k++) {
        expect(r.pmfWildReelsColossal[k]).toBeCloseTo(r.pmfWildReelsMain[k], 9);
      }
    });

    it('p_w = 0 everywhere → K_main = 0 always', () => {
      const r = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        perReelMainWildProb: [0, 0, 0, 0, 0],
      });
      expect(r.pmfWildReelsMain[0]).toBeCloseTo(1, 9);
      expect(r.expectedWildReelsMain).toBeCloseTo(0, 9);
    });

    it('p_w = 1 everywhere → K_main = N always', () => {
      const N = baseCfg.numReels;
      const r = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        perReelMainWildProb: new Array(N).fill(1),
      });
      expect(r.pmfWildReelsMain[N]).toBeCloseTo(1, 9);
      expect(r.expectedWildReelsMain).toBeCloseTo(N, 9);
    });

    it('uniform p_w PMF matches Binomial(N, p)', () => {
      const N = baseCfg.numReels;
      const p = 0.2;
      const r = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        perReelMainWildProb: new Array(N).fill(p),
      });
      // Compare to Binomial PMF
      const binomPmf = (n: number, pp: number) => {
        const pmf = new Array(n + 1);
        pmf[0] = Math.pow(1 - pp, n);
        const ratio = pp / (1 - pp);
        for (let k = 1; k <= n; k++) pmf[k] = (pmf[k - 1] * ratio * (n - k + 1)) / k;
        return pmf;
      };
      const expected = binomPmf(N, p);
      for (let k = 0; k <= N; k++) {
        expect(r.pmfWildReelsMain[k]).toBeCloseTo(expected[k], 9);
      }
    });

    it('probFullWildBothGrids = P(K_main=N) · q_t^N', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      const N = baseCfg.numReels;
      const expected = r.pmfWildReelsMain[N] * Math.pow(baseCfg.probTransferToColossal, N);
      expect(r.probFullWildBothGrids).toBeCloseTo(expected, 9);
    });

    it('probBothGridsAtLeastOneWild ∈ [0, 1]', () => {
      const r = analyzeColossalReelsWildTransfer(baseCfg);
      expect(r.probBothGridsAtLeastOneWild).toBeGreaterThanOrEqual(0);
      expect(r.probBothGridsAtLeastOneWild).toBeLessThanOrEqual(1);
    });

    it('payoutMain = payoutCol = 0 → E[Y] = 0', () => {
      const N = baseCfg.numReels;
      const r = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        payoutMainGivenWildReels: new Array(N + 1).fill(0),
        payoutColossalGivenWildReels: new Array(N + 1).fill(0),
      });
      expect(r.expectedTotalPayoutPerSpin).toBe(0);
    });

    it('linear scale of payouts → linear scale of E[Y]', () => {
      const r1 = analyzeColossalReelsWildTransfer(baseCfg);
      const r3 = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        payoutMainGivenWildReels: baseCfg.payoutMainGivenWildReels.map((v) => v * 3),
        payoutColossalGivenWildReels: baseCfg.payoutColossalGivenWildReels.map((v) => v * 3),
      });
      expect(r3.expectedTotalPayoutPerSpin / r1.expectedTotalPayoutPerSpin).toBeCloseTo(3, 1);
    });

    it('joint bonus matrix adds linearly to E[Y]', () => {
      const N = baseCfg.numReels;
      const joint: number[][] = new Array(N + 1)
        .fill(0)
        .map(() => new Array(N + 1).fill(0));
      joint[N][N] = 1000; // bonus za full-wild both grids
      const rNoJoint = analyzeColossalReelsWildTransfer(baseCfg);
      const rJoint = analyzeColossalReelsWildTransfer({ ...baseCfg, jointBonusPayoutMatrix: joint });
      const expectedDelta = 1000 * rNoJoint.probFullWildBothGrids;
      expect(rJoint.expectedTotalPayoutPerSpin - rNoJoint.expectedTotalPayoutPerSpin).toBeCloseTo(
        expectedDelta,
        6,
      );
    });
  });

  describe('monotonicity', () => {
    it('higher q_t → more colossal wilds expected', () => {
      const rLow = analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 0.2 });
      const rHigh = analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 0.9 });
      expect(rHigh.expectedWildReelsColossal).toBeGreaterThan(rLow.expectedWildReelsColossal);
    });

    it('higher per-reel wild prob → more E[K_main]', () => {
      const N = baseCfg.numReels;
      const rLow = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        perReelMainWildProb: new Array(N).fill(0.05),
      });
      const rHigh = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        perReelMainWildProb: new Array(N).fill(0.30),
      });
      expect(rHigh.expectedWildReelsMain).toBeGreaterThan(rLow.expectedWildReelsMain);
    });

    it('higher q_t → higher P(full wild both grids)', () => {
      const rLow = analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 0.2 });
      const rHigh = analyzeColossalReelsWildTransfer({ ...baseCfg, probTransferToColossal: 0.9 });
      expect(rHigh.probFullWildBothGrids).toBeGreaterThan(rLow.probFullWildBothGrids);
    });

    it('higher payouts → higher E[Y]', () => {
      const r1 = analyzeColossalReelsWildTransfer(baseCfg);
      const r2 = analyzeColossalReelsWildTransfer({
        ...baseCfg,
        payoutColossalGivenWildReels: baseCfg.payoutColossalGivenWildReels.map((v) => v * 2),
      });
      expect(r2.expectedTotalPayoutPerSpin).toBeGreaterThan(r1.expectedTotalPayoutPerSpin);
    });
  });

  describe('MC cross-validation', () => {
    const tightCfg: ColossalReelsWildTransferConfig = {
      numReels: 5,
      perReelMainWildProb: [0.20, 0.20, 0.22, 0.18, 0.20],
      probTransferToColossal: 0.80,
      payoutMainGivenWildReels: [0, 0, 0.5, 5, 50, 500],
      payoutColossalGivenWildReels: [0, 0, 1, 10, 100, 1000],
    };

    it('CF E[K_main] within 3% rel of MC mean @ 30K spins', () => {
      const cf = analyzeColossalReelsWildTransfer(tightCfg);
      const mc = simulateColossalReelsWildTransfer(tightCfg, 30_000, 0xC0FFEE);
      const rel =
        Math.abs(cf.expectedWildReelsMain - mc.meanWildReelsMain) / mc.meanWildReelsMain;
      expect(rel).toBeLessThan(0.05);
    });

    it('CF E[K_col] within 4% rel of MC mean', () => {
      const cf = analyzeColossalReelsWildTransfer(tightCfg);
      const mc = simulateColossalReelsWildTransfer(tightCfg, 30_000, 0xBEEF_184);
      const rel =
        Math.abs(cf.expectedWildReelsColossal - mc.meanWildReelsColossal) /
        mc.meanWildReelsColossal;
      expect(rel).toBeLessThan(0.05);
    });

    it('CF P(both grids ≥ 1 wild) within 3pp abs of MC', () => {
      const cf = analyzeColossalReelsWildTransfer(tightCfg);
      const mc = simulateColossalReelsWildTransfer(tightCfg, 30_000, 0xCAFE);
      const absDiff = Math.abs(
        cf.probBothGridsAtLeastOneWild - mc.observedProbBothGridsAtLeastOne,
      );
      expect(absDiff).toBeLessThan(0.04);
    });

    it('CF pmfMain within 2pp abs per state of MC observation', () => {
      const cf = analyzeColossalReelsWildTransfer(tightCfg);
      const mc = simulateColossalReelsWildTransfer(tightCfg, 30_000, 0xFEED);
      for (let k = 0; k <= tightCfg.numReels; k++) {
        const absDiff = Math.abs(cf.pmfWildReelsMain[k] - mc.observedPmfWildReelsMain[k]);
        expect(absDiff).toBeLessThan(0.03);
      }
    });

    it('CF E[Y] within 10% rel of MC mean (heavy-tail payout schedule)', () => {
      const cf = analyzeColossalReelsWildTransfer(tightCfg);
      const mc = simulateColossalReelsWildTransfer(tightCfg, 30_000, 0xD00D);
      const rel =
        Math.abs(cf.expectedTotalPayoutPerSpin - mc.meanTotalPayoutPerSpin) /
        Math.max(cf.expectedTotalPayoutPerSpin, 1e-9);
      expect(rel).toBeLessThan(0.15);
    });
  });

  describe('determinism', () => {
    it('same seed → identical MC output', () => {
      const a = simulateColossalReelsWildTransfer(baseCfg, 1000, 0xAA);
      const b = simulateColossalReelsWildTransfer(baseCfg, 1000, 0xAA);
      expect(a.meanWildReelsMain).toBe(b.meanWildReelsMain);
      expect(a.meanWildReelsColossal).toBe(b.meanWildReelsColossal);
      expect(a.meanTotalPayoutPerSpin).toBe(b.meanTotalPayoutPerSpin);
    });

    it('different seeds → different MC outputs', () => {
      const a = simulateColossalReelsWildTransfer(baseCfg, 1000, 0xAA);
      const b = simulateColossalReelsWildTransfer(baseCfg, 1000, 0xBB);
      expect(a.meanWildReelsMain !== b.meanWildReelsMain || a.meanTotalPayoutPerSpin !== b.meanTotalPayoutPerSpin).toBe(true);
    });
  });

  describe('industry use-cases (L&W M7 Spartacus family)', () => {
    it('Spartacus Gladiator of Rome 5-reel + transfer = 0.85', () => {
      const cfg: ColossalReelsWildTransferConfig = {
        numReels: 5,
        perReelMainWildProb: [0.10, 0.10, 0.12, 0.10, 0.10],
        probTransferToColossal: 0.85,
        payoutMainGivenWildReels: [0, 0, 0.5, 5, 50, 500],
        payoutColossalGivenWildReels: [0, 0, 1, 10, 100, 1000],
      };
      const r = analyzeColossalReelsWildTransfer(cfg);
      expect(r.expectedTotalPayoutPerSpin).toBeGreaterThan(0);
      expect(r.probFullWildBothGrids).toBeGreaterThan(0);
      expect(r.probFullWildBothGrids).toBeLessThan(0.001);
    });

    it('Super Colossal Reels — full transfer (q_t=1)', () => {
      const cfg: ColossalReelsWildTransferConfig = {
        numReels: 5,
        perReelMainWildProb: [0.15, 0.15, 0.18, 0.15, 0.15],
        probTransferToColossal: 1.0,
        payoutMainGivenWildReels: [0, 0, 1, 10, 100, 1000],
        payoutColossalGivenWildReels: [0, 0, 2, 20, 200, 2000],
      };
      const r = analyzeColossalReelsWildTransfer(cfg);
      // q_t=1 → colossal mirror main exactly
      for (let k = 0; k <= cfg.numReels; k++) {
        expect(r.pmfWildReelsColossal[k]).toBeCloseTo(r.pmfWildReelsMain[k], 9);
      }
    });

    it('Call to Arms 50 paylines high-multiplier variant', () => {
      const cfg: ColossalReelsWildTransferConfig = {
        numReels: 5,
        perReelMainWildProb: [0.08, 0.08, 0.10, 0.08, 0.08],
        probTransferToColossal: 0.70,
        payoutMainGivenWildReels: [0, 0, 0.3, 3, 30, 300],
        payoutColossalGivenWildReels: [0, 0, 0.5, 5, 50, 1500], // 1500× FS multiplier escalates top tier
      };
      const r = analyzeColossalReelsWildTransfer(cfg);
      expect(r.expectedTotalPayoutPerSpin).toBeGreaterThan(0);
    });

    it('edge: single-reel degenerates to single-Bernoulli', () => {
      const r = analyzeColossalReelsWildTransfer({
        numReels: 1,
        perReelMainWildProb: [0.5],
        probTransferToColossal: 0.5,
        payoutMainGivenWildReels: [0, 10],
        payoutColossalGivenWildReels: [0, 20],
      });
      expect(r.pmfWildReelsMain[0]).toBeCloseTo(0.5, 9);
      expect(r.pmfWildReelsMain[1]).toBeCloseTo(0.5, 9);
      expect(r.expectedWildReelsMain).toBeCloseTo(0.5, 9);
      expect(r.expectedWildReelsColossal).toBeCloseTo(0.25, 9);
    });
  });
});
