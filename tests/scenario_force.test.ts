/**
 * W152 Wave 18 — scenarioForce importer tests (Faza 15.A.11).
 */

import { describe, it, expect } from 'vitest';
import {
  parseScenarioForce,
  diffScenarioOutcome,
  applyForcedStops,
  ScenarioForceZ,
} from '../src/scenario/forceImporter.js';

describe('parseScenarioForce', () => {
  it('accepts a minimal valid scenario', () => {
    const s = parseScenarioForce({
      scenarioId: 'minimal',
      baseReelSelect: [0, 5, 10],
    });
    expect(s.scenarioId).toBe('minimal');
    expect(s.baseReelSelect).toEqual([0, 5, 10]);
  });
  it('accepts a full scenario with all optional fields', () => {
    const s = parseScenarioForce({
      scenarioId: 'full',
      baseReelSelect: [0, 1, 2, 3, 4],
      freeSpinsReelSelect: [10, 11, 12, 13, 14],
      featureForceTriggers: [
        { feature: 'free_spins', forceParams: { scatters: 4 } },
      ],
      expectedOutcome: { totalWinX: 100, featureCount: 1, triggeredFeatures: ['free_spins'] },
      notes: 'fs trigger then big win',
      author: 'qa-bob',
      createdAtUtc: '2026-05-15T00:00:00Z',
    });
    expect(s.expectedOutcome?.totalWinX).toBe(100);
  });
  it('rejects empty scenarioId', () => {
    expect(() => parseScenarioForce({ scenarioId: '', baseReelSelect: [0] })).toThrow();
  });
  it('rejects empty baseReelSelect', () => {
    expect(() => parseScenarioForce({ scenarioId: 'x', baseReelSelect: [] })).toThrow();
  });
  it('rejects negative stop indices', () => {
    expect(() => parseScenarioForce({ scenarioId: 'x', baseReelSelect: [-1] })).toThrow();
  });
  it('rejects unknown top-level keys (strict)', () => {
    expect(() =>
      ScenarioForceZ.parse({
        scenarioId: 'x',
        baseReelSelect: [0],
        unknown: 'extra',
      }),
    ).toThrow();
  });
});

describe('diffScenarioOutcome', () => {
  it('passes when no expectedOutcome declared', () => {
    const s = parseScenarioForce({ scenarioId: 'x', baseReelSelect: [0] });
    const r = diffScenarioOutcome(s, { totalWinX: 100 });
    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });
  it('passes on matching totalWinX', () => {
    const s = parseScenarioForce({
      scenarioId: 'x',
      baseReelSelect: [0],
      expectedOutcome: { totalWinX: 50 },
    });
    expect(diffScenarioOutcome(s, { totalWinX: 50 }).passed).toBe(true);
  });
  it('fails on mismatched totalWinX', () => {
    const s = parseScenarioForce({
      scenarioId: 'x',
      baseReelSelect: [0],
      expectedOutcome: { totalWinX: 50 },
    });
    const r = diffScenarioOutcome(s, { totalWinX: 100 });
    expect(r.passed).toBe(false);
    expect(r.failures[0].field).toBe('totalWinX');
  });
  it('fails on mismatched featureCount', () => {
    const s = parseScenarioForce({
      scenarioId: 'x',
      baseReelSelect: [0],
      expectedOutcome: { featureCount: 1 },
    });
    expect(diffScenarioOutcome(s, { featureCount: 0 }).passed).toBe(false);
  });
  it('triggeredFeatures comparison is order-insensitive', () => {
    const s = parseScenarioForce({
      scenarioId: 'x',
      baseReelSelect: [0],
      expectedOutcome: { triggeredFeatures: ['free_spins', 'wheel'] },
    });
    expect(
      diffScenarioOutcome(s, { triggeredFeatures: ['wheel', 'free_spins'] }).passed,
    ).toBe(true);
  });
});

describe('applyForcedStops', () => {
  it('wraps stops modulo strip length', () => {
    expect(applyForcedStops([0, 5, 100], [10, 10, 10])).toEqual([0, 5, 0]);
  });
  it('preserves in-range stops', () => {
    expect(applyForcedStops([3, 7], [10, 10])).toEqual([3, 7]);
  });
  it('rejects mismatched lengths', () => {
    expect(() => applyForcedStops([1], [10, 10])).toThrow();
  });
  it('rejects negative stop', () => {
    expect(() => applyForcedStops([-1], [10])).toThrow(RangeError);
  });
  it('rejects non-positive strip length', () => {
    expect(() => applyForcedStops([0], [0])).toThrow();
  });
});
