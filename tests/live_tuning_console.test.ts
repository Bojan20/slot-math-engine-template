/**
 * W152 Wave 24 — liveTuningConsole tests (Faza 14.4).
 */

import { describe, it, expect } from 'vitest';
import {
  computeDeviation,
  suggestAdjustment,
  TuningConsole,
} from '../src/sim/liveTuningConsole.js';

const TARGET = { rtp: 0.96, volatility: 0.5, hitFreq: 0.3 };

describe('computeDeviation', () => {
  it('zero deviation when measured matches target', () => {
    const d = computeDeviation(TARGET, { rtp: 0.96, volatility: 0.5, hitFreq: 0.3 });
    expect(d.l2Norm).toBeCloseTo(0, 9);
  });
  it('positive rtpDelta when over-paying', () => {
    const d = computeDeviation(TARGET, { rtp: 0.99, volatility: 0.5, hitFreq: 0.3 });
    expect(d.rtpDelta).toBeCloseTo(0.03, 9);
  });
  it('L2 norm aggregates all deltas', () => {
    const d = computeDeviation(TARGET, { rtp: 0.97, volatility: 0.51, hitFreq: 0.31 });
    expect(d.l2Norm).toBeGreaterThan(0);
  });
  it('handles optional maxWinFreq', () => {
    const d = computeDeviation(
      { ...TARGET, maxWinFreq: 0.001 },
      { rtp: 0.96, volatility: 0.5, hitFreq: 0.3, maxWinFreq: 0.0015 },
    );
    expect(d.maxWinFreqDelta).toBeCloseTo(0.0005, 9);
  });
});

describe('suggestAdjustment', () => {
  it('paytableScale < 1 when over-paying', () => {
    const dev = computeDeviation(TARGET, { rtp: 0.99, volatility: 0.5, hitFreq: 0.3 });
    const s = suggestAdjustment(dev, { A: 'lp', H: 'hp' }, 0.5);
    expect(s.paytableScale).toBeLessThan(1);
  });
  it('paytableScale > 1 when under-paying', () => {
    const dev = computeDeviation(TARGET, { rtp: 0.93, volatility: 0.5, hitFreq: 0.3 });
    const s = suggestAdjustment(dev, { A: 'lp', H: 'hp' }, 0.5);
    expect(s.paytableScale).toBeGreaterThan(1);
  });
  it('rationale string mentions paytable scale', () => {
    const dev = computeDeviation(TARGET, { rtp: 0.97, volatility: 0.5, hitFreq: 0.3 });
    const s = suggestAdjustment(dev, { A: 'lp' }, 0.5);
    expect(s.rationale).toMatch(/paytable scale/);
  });
  it('clamps learningRate to [0, 1]', () => {
    const dev = computeDeviation(TARGET, { rtp: 0.99, volatility: 0.5, hitFreq: 0.3 });
    const sZero = suggestAdjustment(dev, { A: 'lp' }, 0); // no change
    expect(sZero.paytableScale).toBeCloseTo(1, 9);
    const sNeg = suggestAdjustment(dev, { A: 'lp' }, -1); // clamps to 0
    expect(sNeg.paytableScale).toBeCloseTo(1, 9);
  });
  it('non-LP/HP symbols stay at 1.0 weight', () => {
    const dev = computeDeviation(TARGET, { rtp: 0.99, volatility: 0.5, hitFreq: 0.3 });
    const s = suggestAdjustment(dev, { W: 'wild', S: 'scatter' }, 0.5);
    expect(s.weightScale.W).toBe(1.0);
    expect(s.weightScale.S).toBe(1.0);
  });
});

describe('TuningConsole — construction', () => {
  it('rejects invalid target rtp', () => {
    expect(() => new TuningConsole({ rtp: -0.1, volatility: 0.5, hitFreq: 0.3 })).toThrow(RangeError);
    expect(() => new TuningConsole({ rtp: 2.0, volatility: 0.5, hitFreq: 0.3 })).toThrow(RangeError);
  });
  it('rejects invalid hitFreq', () => {
    expect(() => new TuningConsole({ rtp: 0.96, volatility: 0.5, hitFreq: 1.5 })).toThrow(RangeError);
  });
  it('rejects negative volatility', () => {
    expect(() => new TuningConsole({ rtp: 0.96, volatility: -0.1, hitFreq: 0.3 })).toThrow(RangeError);
  });
});

describe('TuningConsole — recordStep', () => {
  it('records step + computes suggestion', () => {
    const c = new TuningConsole(TARGET);
    const step = c.recordStep({ rtp: 0.99, volatility: 0.5, hitFreq: 0.3 }, { A: 'lp', H: 'hp' });
    expect(step.iteration).toBe(0);
    expect(step.deviation.rtpDelta).toBeCloseTo(0.03);
    expect(step.suggestion.paytableScale).toBeLessThan(1);
  });
  it('iteration increments across steps', () => {
    const c = new TuningConsole(TARGET);
    c.recordStep({ rtp: 0.99, volatility: 0.5, hitFreq: 0.3 }, { A: 'lp' });
    const step2 = c.recordStep({ rtp: 0.97, volatility: 0.5, hitFreq: 0.3 }, { A: 'lp' });
    expect(step2.iteration).toBe(1);
  });
});

describe('TuningConsole — convergence', () => {
  it('isConverged true when L2 below threshold', () => {
    const c = new TuningConsole(TARGET);
    c.recordStep({ rtp: 0.961, volatility: 0.501, hitFreq: 0.301 }, { A: 'lp' });
    expect(c.isConverged(0.05)).toBe(true);
  });
  it('isConverged false on empty history', () => {
    const c = new TuningConsole(TARGET);
    expect(c.isConverged()).toBe(false);
  });
  it('trajectory shows L2 decrease over iterations', () => {
    const c = new TuningConsole(TARGET);
    c.recordStep({ rtp: 1.05, volatility: 0.6, hitFreq: 0.4 }, { A: 'lp' });
    c.recordStep({ rtp: 1.01, volatility: 0.55, hitFreq: 0.35 }, { A: 'lp' });
    c.recordStep({ rtp: 0.97, volatility: 0.51, hitFreq: 0.31 }, { A: 'lp' });
    const traj = c.convergenceTrajectory();
    expect(traj).toHaveLength(3);
    expect(traj[2]).toBeLessThan(traj[0]);
  });
});

describe('TuningConsole — accept + serialize', () => {
  it('acceptLastSuggestion stamps step', () => {
    const c = new TuningConsole(TARGET);
    c.recordStep({ rtp: 0.99, volatility: 0.5, hitFreq: 0.3 }, { A: 'lp' });
    c.acceptLastSuggestion();
    const last = c.getHistory()[0];
    expect(last.acceptedSuggestion).toBeDefined();
  });
  it('acceptLastSuggestion throws on empty history', () => {
    const c = new TuningConsole(TARGET);
    expect(() => c.acceptLastSuggestion()).toThrow();
  });
  it('serialize / deserialize round-trip', () => {
    const c = new TuningConsole(TARGET);
    c.recordStep({ rtp: 0.99, volatility: 0.5, hitFreq: 0.3 }, { A: 'lp' });
    const persisted = c.serialize();
    const restored = TuningConsole.deserialize(persisted);
    expect(restored.getHistory()).toHaveLength(1);
    expect(restored.convergenceTrajectory()).toEqual(c.convergenceTrajectory());
  });
  it('acceptLastSuggestion can override values', () => {
    const c = new TuningConsole(TARGET);
    c.recordStep({ rtp: 0.99, volatility: 0.5, hitFreq: 0.3 }, { A: 'lp' });
    c.acceptLastSuggestion({ paytableScale: 0.8 });
    expect(c.getHistory()[0].acceptedSuggestion?.paytableScale).toBe(0.8);
  });
});
