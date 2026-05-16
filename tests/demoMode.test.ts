/**
 * W152 Wave 56 — Demo Mode controller tests.
 */

import { describe, it, expect } from 'vitest';
import {
  DemoModeController,
  validateScript,
  verifyDemoSession,
  type DemoSpinOutcome,
  type DemoSessionReport,
} from '../src/sim/demoMode.js';

const sampleScript: DemoSpinOutcome[] = [
  { spinId: 'spin_001', reelStops: [0, 5, 10, 3, 7], expectedWinX: 0 },
  { spinId: 'spin_002', reelStops: [1, 6, 11, 4, 8], expectedWinX: 25 },
  { spinId: 'spin_003', reelStops: [2, 7, 12, 5, 9], expectedWinX: 250, featureTriggers: [{ featureKind: 'free_spins', forceParams: { scatters: 4 } }] },
];

// ── Validation ─────────────────────────────────────────────────────────────

describe('validateScript', () => {
  it('rejects empty script', () => {
    expect(() => validateScript([])).toThrow();
  });
  it('rejects non-array', () => {
    expect(() => validateScript(null as unknown as DemoSpinOutcome[])).toThrow();
  });
  it('rejects empty spinId', () => {
    expect(() => validateScript([{ spinId: '', reelStops: [0], expectedWinX: 0 }])).toThrow();
  });
  it('rejects duplicate spinId', () => {
    expect(() =>
      validateScript([
        { spinId: 'a', reelStops: [0], expectedWinX: 0 },
        { spinId: 'a', reelStops: [0], expectedWinX: 0 },
      ]),
    ).toThrow();
  });
  it('rejects empty reelStops', () => {
    expect(() => validateScript([{ spinId: 'a', reelStops: [], expectedWinX: 0 }])).toThrow();
  });
  it('rejects negative reel stop', () => {
    expect(() => validateScript([{ spinId: 'a', reelStops: [-1], expectedWinX: 0 }])).toThrow();
  });
  it('rejects non-integer reel stop', () => {
    expect(() => validateScript([{ spinId: 'a', reelStops: [1.5], expectedWinX: 0 }])).toThrow();
  });
  it('rejects negative expectedWinX', () => {
    expect(() => validateScript([{ spinId: 'a', reelStops: [0], expectedWinX: -1 }])).toThrow();
  });
  it('rejects empty featureKind in trigger', () => {
    expect(() =>
      validateScript([{
        spinId: 'a',
        reelStops: [0],
        expectedWinX: 0,
        featureTriggers: [{ featureKind: '' }],
      }]),
    ).toThrow();
  });
  it('accepts valid script', () => {
    expect(() => validateScript(sampleScript)).not.toThrow();
  });
});

// ── Controller lifecycle ───────────────────────────────────────────────────

describe('DemoModeController — lifecycle', () => {
  it('not active initially', () => {
    const c = new DemoModeController();
    expect(c.isActive()).toBe(false);
    expect(c.getAttestation()).toBeNull();
  });
  it('startSession activates + returns attestation', () => {
    const c = new DemoModeController();
    const att = c.startSession(sampleScript);
    expect(c.isActive()).toBe(true);
    expect(att.sessionId.length).toBeGreaterThan(0);
    expect(att.scriptLength).toBe(sampleScript.length);
    expect(att.scriptDigest.length).toBe(64); // SHA-256 hex
    expect(att.cycleMode).toBe('halt');
  });
  it('cannot start session while one active', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    expect(() => c.startSession(sampleScript)).toThrow();
  });
  it('endSession returns report', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    c.nextSpin();
    c.nextSpin();
    const report = c.endSession();
    expect(c.isActive()).toBe(false);
    expect(report.spinsServed).toBe(2);
    expect(report.audit.length).toBe(2);
    expect(report.auditDigest.length).toBe(64);
  });
  it('cannot endSession when inactive', () => {
    const c = new DemoModeController();
    expect(() => c.endSession()).toThrow();
  });
});

// ── nextSpin behavior ──────────────────────────────────────────────────────

describe('DemoModeController — nextSpin', () => {
  it('returns scripted outcomes in order', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    expect(c.nextSpin()!.spinId).toBe('spin_001');
    expect(c.nextSpin()!.spinId).toBe('spin_002');
    expect(c.nextSpin()!.spinId).toBe('spin_003');
  });
  it('cycleMode=halt returns null when exhausted', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript, 'halt');
    for (let i = 0; i < sampleScript.length; i++) c.nextSpin();
    expect(c.nextSpin()).toBeNull();
  });
  it('cycleMode=loop wraps around', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript, 'loop');
    for (let i = 0; i < sampleScript.length; i++) c.nextSpin();
    expect(c.nextSpin()!.spinId).toBe('spin_001');
    expect(c.cycleCountValue()).toBe(1);
  });
  it('cycleMode=error throws when exhausted', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript, 'error');
    for (let i = 0; i < sampleScript.length; i++) c.nextSpin();
    expect(() => c.nextSpin()).toThrow();
  });
  it('nextSpin throws when inactive', () => {
    const c = new DemoModeController();
    expect(() => c.nextSpin()).toThrow();
  });
});

// ── RNG guard ──────────────────────────────────────────────────────────────

describe('DemoModeController — assertNoRngCall guard', () => {
  it('throws when session active', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    expect(() => c.assertNoRngCall('test')).toThrow(/demo session active/);
  });
  it('does not throw when inactive', () => {
    const c = new DemoModeController();
    expect(() => c.assertNoRngCall('test')).not.toThrow();
  });
  it('does not throw after endSession', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    c.endSession();
    expect(() => c.assertNoRngCall('test')).not.toThrow();
  });
});

// ── Attestation & determinism ──────────────────────────────────────────────

describe('DemoModeController — attestation', () => {
  it('same script + same start time ⇒ identical sessionId & digest', () => {
    const fixedNow = () => 1234567890;
    const c1 = new DemoModeController({ nowFn: fixedNow });
    const c2 = new DemoModeController({ nowFn: fixedNow });
    const a1 = c1.startSession(sampleScript);
    const a2 = c2.startSession(sampleScript);
    expect(a1.sessionId).toBe(a2.sessionId);
    expect(a1.scriptDigest).toBe(a2.scriptDigest);
  });
  it('different scripts ⇒ different digests', () => {
    const fixedNow = () => 1234567890;
    const c1 = new DemoModeController({ nowFn: fixedNow });
    const c2 = new DemoModeController({ nowFn: fixedNow });
    const a1 = c1.startSession(sampleScript);
    const altScript: DemoSpinOutcome[] = [{ spinId: 'x', reelStops: [99], expectedWinX: 0 }];
    const a2 = c2.startSession(altScript);
    expect(a1.scriptDigest).not.toBe(a2.scriptDigest);
  });
  it('different start times ⇒ different sessionId, same script digest', () => {
    const c1 = new DemoModeController({ nowFn: () => 1000 });
    const c2 = new DemoModeController({ nowFn: () => 2000 });
    const a1 = c1.startSession(sampleScript);
    const a2 = c2.startSession(sampleScript);
    expect(a1.sessionId).not.toBe(a2.sessionId);
    expect(a1.scriptDigest).toBe(a2.scriptDigest);
  });
});

// ── Audit sink ─────────────────────────────────────────────────────────────

describe('DemoModeController — audit sink', () => {
  it('sink called on every spin', () => {
    const entries: number[] = [];
    const c = new DemoModeController({ auditSink: (e) => entries.push(e.sequenceNum) });
    c.startSession(sampleScript);
    c.nextSpin();
    c.nextSpin();
    expect(entries).toEqual([0, 1]);
  });
  it('sink errors do not propagate', () => {
    const c = new DemoModeController({ auditSink: () => { throw new Error('boom'); } });
    c.startSession(sampleScript);
    expect(() => c.nextSpin()).not.toThrow();
  });
});

// ── Auditor verification ───────────────────────────────────────────────────

describe('verifyDemoSession — auditor checks', () => {
  it('valid session passes verification', () => {
    const c = new DemoModeController({ nowFn: () => 100 });
    c.startSession(sampleScript);
    c.nextSpin();
    c.nextSpin();
    c.nextSpin();
    const report = c.endSession();
    const result = verifyDemoSession(sampleScript, report);
    expect(result.ok).toBe(true);
    expect(result.scriptDigestMatch).toBe(true);
    expect(result.auditDigestMatch).toBe(true);
    expect(result.outcomeMismatches).toBe(0);
    expect(result.errors.length).toBe(0);
  });
  it('tampered script ⇒ digest mismatch', () => {
    const c = new DemoModeController({ nowFn: () => 100 });
    c.startSession(sampleScript);
    c.nextSpin();
    const report = c.endSession();
    const tampered: DemoSpinOutcome[] = [
      { spinId: 'spin_001', reelStops: [99, 99, 99, 99, 99], expectedWinX: 0 },
      sampleScript[1],
      sampleScript[2],
    ];
    const result = verifyDemoSession(tampered, report);
    expect(result.ok).toBe(false);
    expect(result.scriptDigestMatch).toBe(false);
  });
  it('tampered audit entry ⇒ audit digest mismatch', () => {
    const c = new DemoModeController({ nowFn: () => 100 });
    c.startSession(sampleScript);
    c.nextSpin();
    const report = c.endSession();
    // Tamper with audit entry
    const tamperedReport: DemoSessionReport = JSON.parse(JSON.stringify(report));
    tamperedReport.audit[0].outcome.expectedWinX = 999999;
    const result = verifyDemoSession(sampleScript, tamperedReport);
    expect(result.ok).toBe(false);
    expect(result.auditDigestMatch).toBe(false);
    expect(result.outcomeMismatches).toBeGreaterThan(0);
  });
  it('out-of-range scriptIndex ⇒ detected', () => {
    const c = new DemoModeController({ nowFn: () => 100 });
    c.startSession(sampleScript);
    c.nextSpin();
    const report = c.endSession();
    const tamperedReport: DemoSessionReport = JSON.parse(JSON.stringify(report));
    tamperedReport.audit[0].scriptIndex = 999;
    const result = verifyDemoSession(sampleScript, tamperedReport);
    expect(result.ok).toBe(false);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('DemoModeController — edges', () => {
  it('single-spin script works', () => {
    const c = new DemoModeController();
    c.startSession([{ spinId: 'only', reelStops: [0], expectedWinX: 0 }]);
    expect(c.nextSpin()!.spinId).toBe('only');
  });
  it('cursor tracking', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    expect(c.cursorValue()).toBe(0);
    c.nextSpin();
    expect(c.cursorValue()).toBe(1);
    c.nextSpin();
    expect(c.cursorValue()).toBe(2);
  });
  it('spinsServed tracking', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript);
    expect(c.spinsServed()).toBe(0);
    c.nextSpin();
    expect(c.spinsServed()).toBe(1);
  });
  it('metadata preserved', () => {
    const c = new DemoModeController();
    const meta = { label: 'test', operatorId: 'op-1', reason: 'audit' };
    const att = c.startSession(sampleScript, 'halt', meta);
    expect(att.metadata).toEqual(meta);
  });
  it('audit sink receives entries in order', () => {
    const seqs: number[] = [];
    const c = new DemoModeController({ auditSink: (e) => seqs.push(e.sequenceNum) });
    c.startSession(sampleScript);
    c.nextSpin();
    c.nextSpin();
    c.nextSpin();
    c.endSession();
    expect(seqs).toEqual([0, 1, 2]);
  });
});

// ── Loop mode stress ─────────────────────────────────────────────────────

describe('DemoModeController — loop stress', () => {
  it('100 cycles with audit', () => {
    const c = new DemoModeController();
    c.startSession(sampleScript, 'loop');
    for (let i = 0; i < 100 * sampleScript.length; i++) {
      const o = c.nextSpin();
      expect(o).not.toBeNull();
    }
    const report = c.endSession();
    expect(report.cycleCount).toBe(99); // first pass is cycle 0
    expect(report.spinsServed).toBe(300);
  });
});
